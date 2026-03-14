"use strict";

const MAX_DIM = 0;      // 0 = conservar resolución original
const TARGET_FPS = 24;  // FPS alto para aproximar el original
const MAX_DURATION = 0; // 0 = sin recorte de duración
const MAX_FRAMES = 900; // salvaguarda para evitar consumo de memoria extremo

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "mh-offscreen-gif") return false;

  if (message.type === "CONVERT_VIDEO_TO_GIF") {
    convertVideoToDataUrl(message.videoUrl, message.filename)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // respuesta asíncrona
  }

  if (message.type === "CONVERT_VIDEO_TO_GIF_AND_DOWNLOAD") {
    convertVideoAndDownload(message)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // respuesta asíncrona
  }

  return false;
});

async function convertVideoToDataUrl(videoUrl, filename) {
  const gifBlob = await convertVideoToGifBlob(videoUrl);
  const gifDataUrl = await blobToDataUrl(gifBlob);
  return { ok: true, gifDataUrl, filename };
}

async function convertVideoAndDownload(message) {
  const gifBlob = await convertVideoToGifBlob(message.videoUrl);
  const blobUrl = URL.createObjectURL(gifBlob);

  try {
    const downloadId = await new Promise((resolve, reject) => {
      if (!chrome.downloads?.download) {
        reject(new Error("La API chrome.downloads no está disponible en offscreen."));
        return;
      }

      chrome.downloads.download(
        {
          url: blobUrl,
          filename: message.filename,
          saveAs: Boolean(message.saveAs),
          conflictAction: message.conflictAction,
        },
        (id) => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            reject(new Error(lastError.message || "Fallo al iniciar la descarga."));
            return;
          }
          if (typeof id !== "number") {
            reject(new Error("No se obtuvo downloadId desde chrome.downloads.download."));
            return;
          }
          resolve(id);
        }
      );
    });

    return { ok: true, downloadId, filename: message.filename };
  } finally {
    // El navegador ya tomó la descarga; diferimos revoke para evitar cortar descargas lentas.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
  }
}

async function convertVideoToGifBlob(videoUrl) {
  const video = document.getElementById("vid");
  const canvas = document.getElementById("cnv");
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
  if (!ctx) {
    throw new Error("No se pudo inicializar el canvas para convertir el GIF.");
  }

  // Fetch y creación de blob URL en el documento offscreen (tiene DOM completo)
  const fetchResp = await fetch(videoUrl);
  if (!fetchResp.ok) {
    throw new Error(`No se pudo descargar el video (${fetchResp.status}).`);
  }
  const videoBlob = await fetchResp.blob();
  const blobUrl = URL.createObjectURL(videoBlob);

  try {
  // Cargar video desde blob URL (sin problemas CORS)
  await new Promise((resolve, reject) => {
    video.src = blobUrl;
    video.onloadedmetadata = resolve;
    video.onerror = (e) => reject(new Error("No se pudo cargar el video: " + (e.message || "error desconocido")));
    video.load();
  });

  const duration = MAX_DURATION > 0 ? Math.min(video.duration, MAX_DURATION) : video.duration;
  if (!duration || !isFinite(duration) || duration <= 0) {
    throw new Error("Duración de video no válida.");
  }

  const targetFps = TARGET_FPS;
  const computedFrames = Math.ceil(duration * targetFps);
  const totalFrames = Math.max(1, MAX_FRAMES > 0 ? Math.min(computedFrames, MAX_FRAMES) : computedFrames);
  const frameInterval = duration / totalFrames;

  // Escalar al tamaño máximo preservando proporciones (si MAX_DIM > 0)
  let gW = video.videoWidth;
  let gH = video.videoHeight;
  if (MAX_DIM > 0 && gW > MAX_DIM) {
    gH = Math.round(gH * MAX_DIM / gW);
    gW = MAX_DIM;
  }
  if (MAX_DIM > 0 && gH > MAX_DIM) {
    gW = Math.round(gW * MAX_DIM / gH);
    gH = MAX_DIM;
  }
  canvas.width = gW;
  canvas.height = gH;

  // Capturar frames reproduciendo el video (mucho más rápido que seek por frame).
  const frames = await captureFramesFast(video, ctx, gW, gH, duration, targetFps, totalFrames, frameInterval);
  if (!frames.length) {
    throw new Error("No se pudieron capturar frames del video.");
  }

  const effectiveFps = Math.max(1, Math.min(targetFps, Math.round(frames.length / duration)));
  const delayMs = Math.max(20, Math.round(1000 / effectiveFps));

  // Codificar GIF con el encoder puro JS
  const gifBytes = XtoGIFEncoder.encodeAnimatedGif(frames, gW, gH, delayMs);
  return new Blob([gifBytes], { type: "image/gif" });

  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Error al convertir blob a data URL"));
    reader.readAsDataURL(blob);
  });
}

async function captureFramesFast(video, ctx, width, height, duration, targetFps, totalFrames, frameInterval) {
  try {
    return await captureFramesByPlayback(video, ctx, width, height, duration, targetFps, totalFrames);
  } catch {
    return captureFramesBySeeking(video, ctx, width, height, totalFrames, frameInterval);
  }
}

async function captureFramesBySeeking(video, ctx, width, height, totalFrames, frameInterval) {
  const frames = [];
  for (let i = 0; i < totalFrames; i++) {
    video.currentTime = i * frameInterval;
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });
    ctx.drawImage(video, 0, 0, width, height);
    frames.push(ctx.getImageData(0, 0, width, height));
  }
  return frames;
}

async function captureFramesByPlayback(video, ctx, width, height, duration, targetFps, totalFrames) {
  const frames = [];
  const targetFrameMs = 1000 / Math.max(1, targetFps);
  const endMs = duration * 1000;
  let nextCaptureMs = 0;

  video.pause();
  video.currentTime = 0;
  video.muted = true;

  const capture = () => {
    ctx.drawImage(video, 0, 0, width, height);
    frames.push(ctx.getImageData(0, 0, width, height));
  };

  await video.play();

  if (typeof video.requestVideoFrameCallback === "function") {
    await new Promise((resolve) => {
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        video.pause();
        resolve();
      };

      const onFrame = (_now, metadata) => {
        if (done) return;
        const mediaMs = metadata.mediaTime * 1000;

        if (mediaMs >= nextCaptureMs || frames.length === 0) {
          capture();
          nextCaptureMs += targetFrameMs;
        }

        if (frames.length >= totalFrames || mediaMs >= endMs) {
          finish();
          return;
        }

        video.requestVideoFrameCallback(onFrame);
      };

      video.onended = finish;
      video.requestVideoFrameCallback(onFrame);
    });
  } else {
    await new Promise((resolve) => {
      const timer = setInterval(() => {
        const mediaMs = video.currentTime * 1000;

        if (mediaMs >= nextCaptureMs || frames.length === 0) {
          capture();
          nextCaptureMs += targetFrameMs;
        }

        if (frames.length >= totalFrames || mediaMs >= endMs || video.ended) {
          clearInterval(timer);
          video.pause();
          resolve();
        }
      }, Math.max(8, Math.round(targetFrameMs / 2)));
    });
  }

  if (!frames.length) {
    capture();
  }

  return frames;
}

/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import BrowserDownloadDispatched from '#domain/events/BrowserDownloadDispatched'
import BrowserDownloadIsFailed from '#domain/events/BrowserDownloadFailed'
import type {
  DownloadMediaFileCommand,
  DownloadMediaFileUseCase,
} from '#domain/useCases/downloadMediaFile'
import { DownloadConfig } from '#domain/valueObjects/downloadConfig'
import { DownloadTarget } from '#domain/valueObjects/downloadTarget'
import type { TweetInfo } from '#domain/valueObjects/tweetInfo'
import ConflictAction from '#enums/ConflictAction'
import { downloadConfigToBrowserDownloadOptions } from '#mappers/downloadConfig'
import { downloads, runtime } from 'webextension-polyfill'

const OFFSCREEN_TARGET = 'mh-offscreen-gif'
const OFFSCREEN_PATH = 'static/offscreen-gif.html'

export class BrowserDownloadMediaFile implements DownloadMediaFileUseCase {
  #ok: boolean
  #events: IDomainEvent[]

  readonly askWhereToSave: boolean
  readonly targetTweet: TweetInfo

  constructor(targetTweet: TweetInfo, askWhereToSave: boolean) {
    this.targetTweet = targetTweet
    this.askWhereToSave = askWhereToSave
    this.#events = []
    this.#ok = true
  }

  get isOk() {
    return this.#ok
  }

  get events() {
    return this.#events
  }

  private downloadTargetToConfig(target: DownloadTarget): DownloadConfig {
    return new DownloadConfig({
      conflictAction: ConflictAction.Overwrite,
      saveAs: this.askWhereToSave,
      ...target.mapBy(props => props),
    })
  }

  /**
   * @fires BrowserDownloadDispatched - When the download operation is dispatched successfully.
   * @fires BrowserDownloadFailed - When the download operation is failed.
   */
  async process(command: DownloadMediaFileCommand): Promise<void> {
    const config =
      command.target instanceof DownloadTarget
        ? this.downloadTargetToConfig(command.target)
        : command.target

    const normalizedConfig = await this.normalizeGifConfig(config)

    const downloadId = await downloads.download(
      downloadConfigToBrowserDownloadOptions(normalizedConfig)
    )

    if (isDownloadFailed(downloadId)) {
      this.#events.push(
        new BrowserDownloadIsFailed({
          reason: (runtime.lastError as Error) ?? 'Failed to download',
          config: normalizedConfig,
          tweetInfo: this.targetTweet,
        })
      )
      this.#ok = false
      return
    }

    this.#events.push(
      new BrowserDownloadDispatched({
        id: downloadId,
        config: normalizedConfig,
        tweetInfo: this.targetTweet,
      })
    )
  }

  private async normalizeGifConfig(config: DownloadConfig): Promise<DownloadConfig> {
    const { url, filename, saveAs, conflictAction } = config.mapBy(props => props)
    if (!this.shouldConvertToGif(url, filename)) {
      return config
    }

    const gifDataUrl = await convertMp4ToGifDataUrl(url, filename)
    return new DownloadConfig({
      url: gifDataUrl,
      filename,
      saveAs,
      conflictAction,
    })
  }

  private shouldConvertToGif(url: string, filename: string): boolean {
    return filename.toLowerCase().endsWith('.gif') && /\.mp4($|\?)/i.test(url)
  }
}

async function convertMp4ToGifDataUrl(
  videoUrl: string,
  filename: string
): Promise<string> {
  await ensureOffscreenDocument()

  const result = await chrome.runtime.sendMessage({
    target: OFFSCREEN_TARGET,
    type: 'CONVERT_VIDEO_TO_GIF',
    videoUrl,
    filename,
  })

  if (!result?.ok || typeof result.gifDataUrl !== 'string') {
    throw new Error(result?.error ?? 'Failed to convert video to gif')
  }

  return result.gifDataUrl
}

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenApi = (chrome as any).offscreen
  if (!offscreenApi) {
    throw new Error('Offscreen API is not available in this browser')
  }

  const hasDocument = await offscreenApi.hasDocument()
  if (hasDocument) return

  await offscreenApi.createDocument({
    url: runtime.getURL(OFFSCREEN_PATH),
    reasons: ['BLOBS'],
    justification: 'Convert animated gif videos to real GIF files',
  })
}

/**
 * If the download api was failed downloadId would be `undefined` and lastError would be set.
 */
const isDownloadFailed = (
  downloadId: number | undefined
): downloadId is undefined => downloadId === undefined

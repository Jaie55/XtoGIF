// Telemetry removed — XtoGIF fork does not register with any remote backend.
import type { DomainEventHandler } from '#domain/eventPublisher'
import type { IClientRepository } from '#domain/repositories/client'

export const initClient =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (_clientRepo: IClientRepository, _setUninstallURL: (url: string) => Promise<void>): DomainEventHandler<DomainEventMap['runtime:status:installed']> =>
  async () => undefined


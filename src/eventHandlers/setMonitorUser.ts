// Telemetry removed — XtoGIF fork does not report user identity to any service.
import type { DomainEventHandler } from '#domain/eventPublisher'
import type { IClientRepository } from '#domain/repositories/client'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const setMonitorUser =
  (_clientRepo: IClientRepository): DomainEventHandler<IDomainEvent> =>
  async () => undefined

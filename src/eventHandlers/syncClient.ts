// Telemetry removed — XtoGIF fork does not sync usage data with any remote backend.
import type { DomainEventHandler } from '#domain/eventPublisher'
import type { IClientRepository } from '#domain/repositories/client'
import type { LockContext } from '#libs/locks/types'

export const syncClient =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (_lockContext: LockContext<UnsafeTask>) =>
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  (_clientRepo: IClientRepository): DomainEventHandler<IDomainEvent> =>
  async () => undefined


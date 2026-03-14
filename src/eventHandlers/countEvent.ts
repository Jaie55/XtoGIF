// Telemetry removed — countEvent is a no-op in XtoGIF.
import type { DomainEventHandler } from '#domain/eventPublisher'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const countEvent =
  (_metricName?: string): DomainEventHandler<IDomainEvent> =>
  () => undefined

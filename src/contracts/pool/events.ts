import { BytesWriter, NetEvent } from '@btc-vision/btc-runtime/runtime';

/** Emitted when a new option is written */
export class OptionWrittenEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionWritten', data);
    }
}

/** Emitted when an option is cancelled */
export class OptionCancelledEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionCancelled', data);
    }
}

/** Emitted when an option is purchased */
export class OptionPurchasedEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionPurchased', data);
    }
}

/** Emitted when an option is exercised */
export class OptionExercisedEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionExercised', data);
    }
}

/** Emitted when an option expires */
export class OptionExpiredEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionExpired', data);
    }
}

/** Emitted when an option is transferred to a new buyer */
export class OptionTransferredEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionTransferred', data);
    }
}

/** Emitted when an option is rolled (cancelled + new option created atomically) */
export class OptionRolledEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('OptionRolled', data);
    }
}

/** Emitted when the fee recipient address is updated */
export class FeeRecipientUpdatedEvent extends NetEvent {
    constructor(data: BytesWriter) {
        super('FeeRecipientUpdated', data);
    }
}

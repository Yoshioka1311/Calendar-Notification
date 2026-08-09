export interface ParsedEvent {
  title?: string;
  date?: Date;
  time?: string;
  confidence?: number;
  originalText: string;
}

export interface EventParser {
  parseMessageForEvent(text: string): Promise<ParsedEvent | null>;
}

/**
 * Reserved boundary for future Thai/English LINE message parsing.
 * It intentionally performs no parsing in this release.
 */
export const placeholderEventParser: EventParser = {
  async parseMessageForEvent(_text: string) {
    return null;
  },
};

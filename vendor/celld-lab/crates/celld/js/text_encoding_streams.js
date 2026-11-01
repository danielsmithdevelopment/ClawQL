// TextEncoderStream / TextDecoderStream. TextDecoderStream keeps decoder
// state across chunks so split
// multi-byte sequences are decoded correctly, then flushes at end-of-stream.
globalThis.TextEncoderStream = class TextEncoderStream
    extends TransformStream {
  constructor() {
    const enc = new TextEncoder();
    let pending = '';
    super({
      transform(chunk, controller) {
        let s = pending + String(chunk);
        pending = '';
        if (s.length > 0) {
          const last = s.charCodeAt(s.length - 1);
          if (last >= 0xD800 && last <= 0xDBFF) {
            pending = s[s.length - 1];
            s = s.slice(0, -1);
          }
        }
        if (s.length === 0) return;
        controller.enqueue(enc.encode(s));
      },
      flush(controller) {
        if (pending) controller.enqueue(enc.encode(pending));
      },
    });
  }
  get encoding() { return 'utf-8'; }
};

globalThis.TextDecoderStream = class TextDecoderStream
    extends TransformStream {
  #dec;
  constructor(label = 'utf-8', options = {}) {
    const dec = new TextDecoder(label, options);
    super({
      transform(chunk, controller) {
        if (!(chunk instanceof ArrayBuffer)
            && !ArrayBuffer.isView(chunk))
          throw new TypeError("Chunk must be BufferSource");
        const s = dec.decode(chunk, { stream: true });
        if (s) controller.enqueue(s);
      },
      flush(controller) {
        const s = dec.decode();
        if (s) controller.enqueue(s);
      },
    });
    this.#dec = dec;
  }
  get encoding() { return this.#dec.encoding; }
  get fatal() { return this.#dec.fatal; }
  get ignoreBOM() { return this.#dec.ignoreBOM; }
};

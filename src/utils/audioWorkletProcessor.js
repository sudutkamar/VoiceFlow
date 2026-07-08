/**
 * AudioWorklet Processor for VoiceFlow
 * Replaces deprecated ScriptProcessorNode with modern, performant AudioWorklet
 * Runs in a separate thread for better performance
 */

class VoiceFlowProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.recording = false;
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    
    this.port.onmessage = (e) => {
      if (e.data.type === 'start') {
        this.recording = true;
        this.bufferIndex = 0;
      } else if (e.data.type === 'stop') {
        this.recording = false;
        // Send any remaining partial buffer
        if (this.bufferIndex > 0) {
          const partialBuffer = this.buffer.slice(0, this.bufferIndex);
          this.port.postMessage({ type: 'chunk', data: partialBuffer });
          this.bufferIndex = 0;
        }
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.recording) return true;
    
    const input = inputs[0];
    if (!input || !input[0]) return true;
    
    const channelData = input[0];
    
    // Copy input data to our buffer
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex] = channelData[i];
      this.bufferIndex++;
      
      // When buffer is full, send it and start new buffer
      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage({ type: 'chunk', data: this.buffer.slice() });
        this.bufferIndex = 0;
      }
    }
    
    return true;
  }
}

registerProcessor('voiceflow-processor', VoiceFlowProcessor);

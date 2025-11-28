import { CommonModule } from '@angular/common';
import { Component, signal, ViewChild, ElementRef, ChangeDetectorRef, HostListener } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Chart from 'chart.js/auto';
import annotationPlugin from 'chartjs-plugin-annotation';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-player',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule],
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.scss']
})
export class PlayerComponent {
  protected readonly title = signal('fs-view');

  files: any[] = [];
  selectedFolder: string = '';
  selectedFile = '';
  videoSrc = '';
  selectedIndex = -1;
  isPlaying = false;
  funscriptData: any = null;
  dirHandle?: FileSystemDirectoryHandle;
  chart?: Chart;
  videoDuration: number = 0;
  currentTime: number = 0;
  // Background image data URL captured from first video's first frame
  backgroundDataUrl: string | null = null;
  private animationFrameId: number | null = null;
  private nextVideoCache?: { file: File; funscriptData: any };
  // Map of preloaded object URLs by file index
  preloadedUrls: Map<number, string> = new Map();
  // Zoom mode: false -> object-fit: contain; true -> object-fit: cover
  zoom = false;
  isVertical = false; // true if video has aspect ratio < 1 (portrait)
  isDefaultFunscript = false; // whether the current funscript is a generated default

  @ViewChild('videoRef') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('chartRef') chartRef!: ElementRef<HTMLCanvasElement>;

  constructor(private cdr: ChangeDetectorRef) {
    Chart.register(annotationPlugin);
  }

  // (fixtures support was removed; clean up any related code)

  toggleZoom() {
    this.zoom = !this.zoom;
    try { this.cdr.detectChanges(); } catch { }
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscape(event: Event) {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName?.toLowerCase?.();
    if (!tag) return false;
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if ((target as HTMLElement).isContentEditable) return true;
    return false;
  }

  // Preload object URLs for all files (non-blocking, runs in background)
  async preloadAllVideos() {
    if (!this.dirHandle || !this.files || this.files.length === 0) return;
    // Don't double-preload
    if (this.preloadedUrls.size > 0) return;

    const promises: Promise<void>[] = [];
    for (let i = 0; i < this.files.length; i++) {
      const entry = this.files[i];
      const p = (async () => {
        try {
          const file = await entry.getFile();
          const url = URL.createObjectURL(file);
          this.preloadedUrls.set(i, url);
          // Minor debug hint
          try { this.cdr.detectChanges(); } catch { }
        } catch (e) {
          console.error('Failed to preload file index', i, e);
        }
      })();
      promises.push(p);
    }

    await Promise.all(promises);
    console.log('Preloaded', this.preloadedUrls.size, 'videos');
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    // Only toggle play/pause on Space, and only when the focused element
    // is not an editable control (input, textarea, select, or contenteditable).
    const isSpace = event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar' || event.key === 'Space';
    if (!isSpace) return;

    if (this.isEditableTarget(event.target)) {
      // Let the control handle the space key (typing, sliders, etc.)
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  async selectFolder() {
    try {
      this.dirHandle = await (window as any).showDirectoryPicker();
      if (this.dirHandle) {
        this.selectedFolder = this.dirHandle.name;
        let tempFiles: any[] = [];

        for await (const entry of this.dirHandle.values()) {
          if (entry.kind === 'file' && /^\d{4}-*.*\.mp4$/i.test(entry.name)) {
            tempFiles.push(entry);
          }
        }
        tempFiles.sort((a, b) => this.getFileNumber(a) - this.getFileNumber(b));

        this.files = [];
        for (let i = 0; i < tempFiles.length; i++) {
          this.files.push(tempFiles[i]);
          if (i < tempFiles.length - 1) {
            const currentNum = this.getFileNumber(tempFiles[i]);
            const nextNum = this.getFileNumber(tempFiles[i + 1]);
            const gap = nextNum - currentNum - 1;
            for (let j = 0; j < gap; j++) {
              this.files.push(tempFiles[i]);
            }
          }
        }

        if (this.files.length > 0) {
          this.selectedIndex = 0;
          this.selectedFile = this.getFileName(this.files[0]);
          await this.loadVideo();
          // Start preloading all videos in the background
          this.preloadAllVideos().catch(err => console.error('Preload all error:', err));
        }
      }

    } catch (e) {
      console.error(e);
    }
  }

  async loadVideo() {
    this.funscriptData = null;
    if (this.chart) this.chart.destroy();
    this.videoDuration = 0;
    this.currentTime = 0;
    if (this.selectedIndex < 0) return;
    const selected = this.files[this.selectedIndex];
    this.selectedFile = this.getFileName(selected);

    // Use cached next video if available, otherwise fetch fresh
    let videoFile: File | undefined;
    let funscriptData: any = null;

    if (this.nextVideoCache) {
      videoFile = this.nextVideoCache.file;
      funscriptData = this.nextVideoCache.funscriptData;
      this.nextVideoCache = undefined; // Clear cache after using
    } else {
      videoFile = await selected.getFile();

      if (this.dirHandle) {
        try {
          const funHandle = await this.dirHandle.getFileHandle(`${this.selectedFile}.funscript`);
          const funFile = await funHandle.getFile();
          const text = await funFile.text();
          funscriptData = JSON.parse(text);
        } catch (e) {
          // Funscript not found, continue without it
        }
      }
    }

    // Prefer a preloaded URL if available
    const preloaded = this.preloadedUrls.get(this.selectedIndex);
    if (this.videoSrc && !this.preloadedUrls.has(this.selectedIndex)) {
      // Only revoke the old object URL if it's not one of the preloaded persistent URLs
      try { URL.revokeObjectURL(this.videoSrc); } catch { }
    }

    if (preloaded) {
      this.videoSrc = preloaded;
    } else if (videoFile) {
      this.videoSrc = URL.createObjectURL(videoFile);
    }
    this.funscriptData = funscriptData;
    this.isDefaultFunscript = false;

    if (this.funscriptData) {
      this.cdr.detectChanges();
      requestAnimationFrame(() => {
        try {
          this.createChart();
        } catch (e) {
          console.error('Error creating chart on raf:', e);
        }
      });
    } else {
      // still create an empty chart so there's a placeholder
      this.cdr.detectChanges();
      requestAnimationFrame(() => {
        try { this.createChart(); } catch (e) { }
      });
    }
  }

  onLoadedMetadata() {
    this.videoDuration = this.videoRef.nativeElement.duration;
    try {
      const v = this.videoRef.nativeElement;
      const container = v.parentElement as HTMLElement | null;
      if (container && v.videoWidth && v.videoHeight) {
        container.style.setProperty('--video-aspect', `${v.videoWidth}/${v.videoHeight}`);
        this.isVertical = (v.videoWidth / v.videoHeight) < 1;
      }
    } catch (e) {
      console.warn('Failed to set video aspect CSS variable', e);
    }
    // If we don't have any funscript data from file or cache, generate a default one now
    if (!this.funscriptData) {
      try {
        this.funscriptData = this.generateDefaultFunscript(this.selectedFile, this.videoDuration);
        this.isDefaultFunscript = true;
      } catch (e) {
        console.warn('Failed to generate default funscript:', e);
        this.isDefaultFunscript = false;
      }
      // create the chart with the newly generated default funscript
      requestAnimationFrame(() => {
        try { this.createChart(); } catch (e) { console.error('Error creating chart with default funscript:', e); }
      });
    }
    this.cdr.detectChanges();
  }

  private generateDefaultFunscript(selectedFile: string, durationSeconds: number) {
    const parts = selectedFile.split('-');
    let kind = 'sin';
    let frequency: number | null = null;
    let rangeType = 'f';

    if (parts.length > 1) {
      kind = parts[1].toLowerCase();
      if (!['ms', 'dg', 'cg', 'rcg', 'bj', 'sin'].includes(kind)) kind = 'sin';

      if (parts.length > 2) {
        const actionCountStr = parts[2];
        const num = parseFloat(actionCountStr.slice(0, -1));
        if (!isNaN(num)) {
          frequency = num / Math.max(0.1, durationSeconds);
        }
        if (parts.length > 3) {
          rangeType = parts[3].toLowerCase();
          if (!['h', 'l', 'f'].includes(rangeType)) rangeType = 'f';
        }
      }
    }

    // Range handling
    let minPos = 0;
    let maxPos = 100;
    if (rangeType === 'h') minPos = 50;
    else if (rangeType === 'l') maxPos = 50;
    const amplitude = (maxPos - minPos) / 2;
    const center = (minPos + maxPos) / 2;

    // Default frequencies per position
    let baseFreq = 1.0;
    switch (kind) {
      case 'ms': baseFreq = 1.35; break;
      case 'dg': baseFreq = 1.8; break;
      case 'cg':
      case 'rcg': baseFreq = 1.33; break;
      case 'bj': baseFreq = 1.5; break;
    }
    if (frequency === null) frequency = baseFreq;

    const dur = Math.max(0.5, durationSeconds || 1);
    const totalMs = Math.round(dur * 1000);
    const cycles = Math.max(1, Math.ceil(frequency * dur));
    const adjustedFreq = cycles / dur;               // ensures integer cycles → start = end
    const dtMs = 50;

    const actions: Array<{ at: number; pos: number }> = [];
    const isSin = kind === 'sin';

    // Base thrust fraction per position
    let baseThrustFraction = 0.5;
    if (!isSin) {
      switch (kind) {
        case 'ms': baseThrustFraction = 0.35; break;
        case 'dg': baseThrustFraction = 0.45; break;
        case 'cg':
        case 'rcg': baseThrustFraction = 0.3; break;
        case 'bj': baseThrustFraction = 0.4; break;
      }
    }

    // Adjust for gravity positions at higher frequencies (more muscular, less asymmetry)
    let thrustFraction = baseThrustFraction;
    const gravityPositions = ['ms', 'cg', 'rcg'];
    if (gravityPositions.includes(kind) && !isSin) {
      const muscularThrustFraction = 0.45;
      const lowFreq = 1.0;
      const highFreq = 2.5;
      const factor = Math.max(0, Math.min(1, (frequency - lowFreq) / (highFreq - lowFreq)));
      thrustFraction = baseThrustFraction + factor * (muscularThrustFraction - baseThrustFraction);
    }
    const withdrawalFraction = 1 - thrustFraction;

    for (let t = 0; t <= totalMs; t += dtMs) {
      const s = t / 1000;
      let pos: number;

      if (isSin) {
        // Symmetric sine, starting at max (100: top/shallow)
        const raw = center + amplitude * Math.sin(2 * Math.PI * adjustedFreq * s + Math.PI / 2);
        pos = Math.round(Math.max(minPos, Math.min(maxPos, raw)) * 100) / 100;
      } else {
        // Asymmetric thrust: fast thrust (decrease pos: top/shallow 100 to bottom/deep 0), slow withdrawal (increase pos: bottom/deep 0 to top/shallow 100)
        const cyclePosition = (s * adjustedFreq) % 1;
        let norm: number;
        if (cyclePosition < thrustFraction) {
          // Fast thrust: 1 to 0
          norm = 1 - (cyclePosition / thrustFraction);
        } else {
          // Slow withdrawal: 0 to 1
          norm = (cyclePosition - thrustFraction) / withdrawalFraction;
        }
        const raw = minPos + (maxPos - minPos) * norm;
        pos = Math.round(raw * 100) / 100;
      }
      actions.push({ at: t, pos });
    }

    // Ensure final point at exact duration
    if (actions[actions.length - 1].at !== totalMs) {
      const s = totalMs / 1000;
      let finalPos: number;
      if (isSin) {
        const raw = center + amplitude * Math.sin(2 * Math.PI * adjustedFreq * s + Math.PI / 2);
        finalPos = Math.round(Math.max(minPos, Math.min(maxPos, raw)) * 100) / 100;
      } else {
        const cyclePosition = (s * adjustedFreq) % 1;
        let norm: number;
        if (cyclePosition < thrustFraction) {
          norm = 1 - (cyclePosition / thrustFraction);
        } else {
          norm = (cyclePosition - thrustFraction) / withdrawalFraction;
        }
        finalPos = Math.round((minPos + (maxPos - minPos) * norm) * 100) / 100;
      }
      actions.push({ at: totalMs, pos: finalPos });
    }

    return { version: '1.0', actions };
  }

  updateProgressLine(time: number) {
    if (this.chart) {
      try {
        const options = this.chart.options as any;
        if (options?.plugins?.annotation?.annotations?.progressLine) {
          options.plugins.annotation.annotations.progressLine.value = time;
          this.chart.update('none');
        }
      } catch (e) {
        console.error('Error updating progress line:', e);
      }
    }
  }

  private createChart() {
    if (!this.chartRef?.nativeElement) {
      return;
    }

    try {
      const actions = this.funscriptData?.actions?.sort((a: any, b: any) => a.at - b.at) || [];
      const dataPoints = actions.length > 0 ? actions.map((a: any) => ({ x: a.at / 1000, y: a.pos })) : [];
      // Calculate max time for x-axis: prefer the data max but fall back to videoDuration or a default
      const maxTime = dataPoints.length > 0 ? Math.max(...dataPoints.map((p: any) => p.x)) : (this.videoDuration > 0 ? this.videoDuration : 100);
      const yMax = 100; //this.isDefaultFunscript ? 10 : 100;

      const canvas = this.chartRef.nativeElement as HTMLCanvasElement;
      // If an existing Chart is attached to this canvas, destroy it before creating a new one
      try {
        const existing = (Chart as any).getChart ? (Chart as any).getChart(canvas) : undefined;
        if (existing) {
          try { existing.destroy(); } catch (err) { console.warn('Error destroying existing Chart instance', err); }
        }
        if (this.chart && (this.chart as any).canvas === canvas) {
          try { this.chart.destroy(); } catch (err) { /* ignore */ }
          this.chart = undefined;
        }
      } catch (err) {
        // Fail safe: ensure we don't abort chart creation, just warn
        console.warn('Unable to destroy previous Chart instance safely', err);
      }
      if (canvas.offsetWidth === 0 || canvas.offsetHeight === 0) {
        // Defer if the canvas hasn't been sized yet
        requestAnimationFrame(() => this.createChart());
        return;
      }
      console.debug('createChart: dataPoints=', dataPoints.length, 'maxTime=', maxTime, 'yMax=', yMax, 'canvas size=', canvas.offsetWidth, 'x', canvas.offsetHeight);

      // Ensure chart uses container size (canvas CSS) instead of fixed attribute
      this.chart = new Chart(canvas, {
        type: 'line',
        data: {
          datasets: [{
            data: dataPoints,
            label: 'Funscript',
            borderColor: 'rgba(34, 180, 255, 0.95)',
            backgroundColor: 'rgba(34, 180, 255, 0.1)',
            borderWidth: 2,
            pointRadius: 0,
            tension: 0.15,
            spanGaps: true,
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              type: 'linear',
              display: false,
              min: 0,
              max: maxTime
            },
            y: {
              display: false,
              min: 0,
              max: yMax
            }
          },
          plugins: {
            legend: {
              display: false
            },
            annotation: {
              annotations: {
                progressLine: {
                  type: 'line',
                  scaleID: 'x',
                  yScaleID: 'y',
                  yMin: 0,
                  yMax: yMax,
                  value: 0,
                  borderColor: 'red',
                  borderWidth: 2
                }
              }
            }
          }
        } as any
      });
      try {
        // Ensure the canvas sizing is respected and Chart.js resizes correctly based on CSS
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        requestAnimationFrame(() => {
          try { this.chart?.resize(); this.chart?.update('none'); } catch (e) { /* ignore */ }
        });
      } catch (e) { }
    } catch (error) {
      console.error('Failed to create chart:', error);
    }
  }

  startAnimationLoop() {
    const animate = () => {
      if (this.isPlaying && this.videoRef) {
        this.currentTime = this.videoRef.nativeElement.currentTime;
        this.updateProgressLine(this.currentTime);
        this.cdr.markForCheck();
        this.animationFrameId = requestAnimationFrame(animate);
      }
    };
    this.animationFrameId = requestAnimationFrame(animate);
    // Preload next video when starting playback
    this.preloadNextVideo();
  }

  stopAnimationLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private async preloadNextVideo() {
    // Don't preload if we're at the last video
    if (this.selectedIndex >= this.files.length - 1 || !this.dirHandle) {
      return;
    }

    try {
      const nextIndex = this.selectedIndex + 1;
      const nextFileEntry = this.files[nextIndex];
      const nextFile = await nextFileEntry.getFile();

      let nextFunscriptData = null;
      try {
        const funHandle = await this.dirHandle.getFileHandle(`${this.getFileName(nextFileEntry)}.funscript`);
        const funFile = await funHandle.getFile();
        const text = await funFile.text();
        nextFunscriptData = JSON.parse(text);
      } catch (e) {
        // Funscript not found or parsing failed, continue without it
      }

      this.nextVideoCache = {
        file: nextFile,
        funscriptData: nextFunscriptData
      };

      // If we preloaded all videos, prefer using preloaded URL for the inactive element
      const preloaded = this.preloadedUrls.get(nextIndex);
      try {
        if (preloaded) {
          // Do not overwrite the active src — we only want to ensure the next file is available in the preloaded map
          console.log('Next video preloaded (url available)');
        }
      } catch (e) {
        // ignore
      }
    } catch (e) {
      console.error('Failed to preload next video:', e);
      this.nextVideoCache = undefined;
    }
  }

  seekVideo() {
    if (this.videoRef) {
      this.videoRef.nativeElement.currentTime = this.currentTime;
      this.updateProgressLine(this.currentTime);
    }
  }

  onLoadedData() {
    if (!this.backgroundDataUrl && this.selectedIndex === 0) {
      // Capture the first visible frame of the first video to use as a background behind the player
      this.captureFirstFrame().catch(e => console.error('captureFirstFrame failed', e));
    }

    if (this.isPlaying) {
      this.play();
    } else {
      this.currentTime = 0;
      this.updateProgressLine(0);
    }
  }

  private async captureFirstFrame() {
    try {
      const video = this.videoRef?.nativeElement;
      if (!video) return;
      // Ensure there's at least one frame
      if (video.readyState < 2) {
        await new Promise<void>(resolve => {
          const onCan = () => {
            video.removeEventListener('canplay', onCan);
            resolve();
          };
          video.addEventListener('canplay', onCan);
          setTimeout(() => { video.removeEventListener('canplay', onCan); resolve(); }, 2000);
        });
      }

      const w = video.videoWidth || video.clientWidth || 600;
      const h = video.videoHeight || video.clientHeight || 400;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      this.backgroundDataUrl = canvas.toDataURL('image/png');
      this.cdr.detectChanges();
    } catch (e) {
      console.error('Error capturing frame:', e);
    }
  }

  autoNext() {
    this.next();
  }

  async previous() {
    if (this.selectedIndex > 0) {
      this.selectedIndex--;
      await this.loadVideo();
    }
  }

  async next() {
    if (this.selectedIndex < this.files.length - 1) {
      this.selectedIndex++;
      await this.loadVideo();
    }
  }

  restart() {
    if (this.videoRef) {
      this.videoRef.nativeElement.currentTime = 0;
      this.currentTime = 0;
      this.updateProgressLine(0);
    }
  }

  play() {
    if (this.videoRef) {
      this.isPlaying = true;
      this.videoRef.nativeElement.play();
      this.startAnimationLoop();
    }
  }

  pause() {
    if (this.videoRef) {
      this.isPlaying = false;
      this.videoRef.nativeElement.pause();
      this.stopAnimationLoop();
      this.currentTime = this.videoRef.nativeElement.currentTime;
      this.updateProgressLine(this.currentTime);
    }
  }

  toggleFullscreen() {
    const elem = this.videoRef?.nativeElement;
    if (elem) {
      if (!document.fullscreenElement) {
        elem.requestFullscreen();
      } else {
        document.exitFullscreen();
      }
    }
  }

  getFileName(entry: any) {
    return entry?.name?.replace(/\.mp4$/i, '') ?? '';
  }

  private getFileNumber(entry: any) {
    const match = entry?.name?.match(/^(\d{4})/);
    return match ? parseInt(match[1], 10) : 0;
  }

  // Cleanup preloaded object URLs when component is destroyed
  ngOnDestroy() {
    try {
      if (this.videoSrc && !Array.from(this.preloadedUrls.values()).includes(this.videoSrc)) {
        URL.revokeObjectURL(this.videoSrc);
      }
    } catch (e) { }
    for (const url of this.preloadedUrls.values()) {
      try { URL.revokeObjectURL(url); } catch (e) { }
    }
  }
}

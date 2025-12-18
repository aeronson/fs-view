import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

@Component({
  selector: 'app-split-video',
  imports: [CommonModule, FormsModule],
  templateUrl: './split-video.html',
  styleUrl: './split-video.scss',
  standalone: true,
})
export class SplitVideo {
  private ffmpeg = new FFmpeg();
  private cv: any; // Assume opencv.js loaded globally as window.cv

  async ngOnInit() {
    await this.ffmpeg.load();
    // Load opencv.js script here if needed
  }

  async onFilesSelected(event: any) {
    for (let file of event.target.files) {
      await this.processVideo(file);
    }
  }

  private async processVideo(file: File) {
    const videoData = await fetchFile(file);
    await this.ffmpeg.writeFile('input.mp4', videoData);

    // Get FPS (simplified, parse from run -i)
    await this.ffmpeg.exec(['-i', 'input.mp4']);
    const fps = 30; // Replace with parsed FPS

    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    await new Promise(resolve => video.onloadedmetadata = resolve);
    const duration = video.duration;
    const numFrames = Math.floor(duration * fps);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;

    const getGrayAtTime = async (time: number): Promise<any> => {
      video.currentTime = time;
      await new Promise(resolve => video.onseeked = resolve);
      ctx.drawImage(video, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const mat = this.cv.matFromImageData(imgData);
      const gray = new this.cv.Mat();
      this.cv.cvtColor(mat, gray, this.cv.COLOR_RGBA2GRAY);
      mat.delete();
      return gray;
    };

    const diffs: number[] = [];
    let prevGray: any = null;
    for (let i = 1; i < numFrames; i++) {
      const time = i / fps;
      const gray = await getGrayAtTime(time);
      if (prevGray) {
        const diffMat = new this.cv.Mat();
        this.cv.absdiff(gray, prevGray, diffMat);
        const mean = this.cv.mean(diffMat)[0];
        diffs.push(mean);
        diffMat.delete();
      }
      if (prevGray) prevGray.delete();
      prevGray = gray;
    }
    if (prevGray) prevGray.delete();

    const autocorr = (signal: number[]): number[] => {
      const n = signal.length;
      const result = new Array(n).fill(0);
      for (let lag = 0; lag < n; lag++) {
        for (let i = 0; i < n - lag; i++) {
          result[lag] += signal[i] * signal[i + lag];
        }
      }
      return result;
    };

    const findPeaks = (arr: number[], distance: number): number[] => {
      const peaks: number[] = [];
      for (let i = 1; i < arr.length - 1; i++) {
        if (arr[i] > arr[i - 1] && arr[i] > arr[i + 1] && (peaks.length === 0 || i - peaks[peaks.length - 1] >= distance)) {
          peaks.push(i);
        }
      }
      return peaks;
    };

    const minPeriod = 5;
    const maxStart = Math.floor(numFrames / 2);
    let cycleStart = 0;
    let bestScore = 0;
    for (let start = 0; start < maxStart; start++) {
      const signal = diffs.slice(start);
      if (signal.length < minPeriod * 3) continue;
      const ac = autocorr(signal);
      const peaks = findPeaks(ac, minPeriod);
      if (peaks.length > 2) {
        const periods = peaks.slice(1).map((p, idx) => p - peaks[idx]);
        const meanPeriod = periods.reduce((a, b) => a + b, 0) / periods.length;
        const std = Math.sqrt(periods.reduce((sum, p) => sum + (p - meanPeriod) ** 2, 0) / periods.length);
        const score = (peaks.length - 1) / (std + 1);
        if (score > bestScore) {
          bestScore = score;
          cycleStart = start + 1;
        }
      }
    }

    const cycleStartTime = cycleStart / fps;
    await this.ffmpeg.exec(['-i', 'input.mp4', '-to', `${cycleStartTime}`, '-c', 'copy', 'setup.mp4']);
    const setupData = await this.ffmpeg.readFile('setup.mp4');
    this.download(new Blob([setupData.buffer as ArrayBuffer], { type: 'video/mp4' }), `setup_${file.name}`);

    const firstGray = await getGrayAtTime(cycleStartTime);
    let bestIndex = numFrames - cycleStart - 1;
    let bestSim = -1;
    for (let j = numFrames - cycleStart - 2; j > 0; j--) {
      const time = (cycleStart + j) / fps;
      const gray = await getGrayAtTime(time);
      const diffMat = new this.cv.Mat();
      this.cv.absdiff(firstGray, gray, diffMat);
      const diff = this.cv.mean(diffMat)[0];
      const sim = 1 / (1 + diff);
      if (sim > bestSim) {
        bestSim = sim;
        bestIndex = j;
      }
      diffMat.delete();
      gray.delete();
    }
    firstGray.delete();

    const cycleEndTime = (cycleStart + bestIndex) / fps;
    await this.ffmpeg.exec(['-i', 'input.mp4', '-ss', `${cycleStartTime}`, '-to', `${cycleEndTime}`, '-c', 'copy', 'cycle.mp4']);
    const cycleData = await this.ffmpeg.readFile('cycle.mp4');
    this.download(new Blob([cycleData.buffer as ArrayBuffer], { type: 'video/mp4' }), `cycle_${file.name}`);

    for (const f of ['input.mp4', 'setup.mp4', 'cycle.mp4']) {
      await this.ffmpeg.unlink(f);
    }
    URL.revokeObjectURL(videoUrl);
  }

  private download(blob: Blob, name: string) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
  }
}
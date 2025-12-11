import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-merge-video',
  imports: [CommonModule, FormsModule],
  templateUrl: './merge-video.html',
  styleUrl: './merge-video.scss',
})
export class MergeVideo {
  @ViewChild('canvas') canvas!: ElementRef<HTMLCanvasElement>;
  videos: File[] = [];
  results: string[] = [];
  cvReady: Promise<void>;

  constructor() {
    this.cvReady = new Promise(resolve => {
      (globalThis as any).cv['onRuntimeInitialized'] = () => resolve();
    });
  }

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.videos = Array.from(input.files || []);
  }

  async processVideos() {
    await this.cvReady;
    if (this.videos.length < 2) return;
    this.results = [];
    const dt = 0.1; // seconds between frames for flow
    const duration = 5; // seconds to sample
    const count = 10;
    for (let i = 0; i < this.videos.length - 1; i++) {
      const vid1 = await this.loadVideo(this.videos[i]);
      const vid2 = await this.loadVideo(this.videos[i + 1]);
      const endPairs = await this.extractEndPairs(vid1, duration, count, dt);
      const startPairs = await this.extractStartPairs(vid2, duration, count, dt);
      const { best1, best2 } = await this.findBestMatch(endPairs, startPairs);
      const trimTime1 = endPairs[best1].currTime;
      const trimTime2 = startPairs[best2].currTime;
      this.results.push(`Trim video ${i + 1} after ${trimTime1.toFixed(2)}s, video ${i + 2} before ${trimTime2.toFixed(2)}s`);
    }
  }

  loadVideo(file: File): Promise<HTMLVideoElement> {
    return new Promise((res) => {
      const vid = document.createElement('video');
      vid.src = URL.createObjectURL(file);
      vid.onloadeddata = () => res(vid);
    });
  }

  async extractImageData(vid: HTMLVideoElement, time: number): Promise<ImageData> {
    vid.currentTime = time;
    await new Promise(r => vid.onseeked = r);
    this.canvas.nativeElement.width = vid.videoWidth;
    this.canvas.nativeElement.height = vid.videoHeight;
    this.canvas.nativeElement.getContext('2d')!.drawImage(vid, 0, 0);
    return this.canvas.nativeElement.getContext('2d')!.getImageData(0, 0, vid.videoWidth, vid.videoHeight);
  }

  async extractEndPairs(vid: HTMLVideoElement, duration: number, count: number, dt: number) {
    const pairs: any[] = [];
    const start = vid.duration - duration - dt;
    const step = duration / (count - 1);
    for (let i = 0; i < count; i++) {
      const prevTime = start + i * step;
      const currTime = prevTime + dt;
      if (prevTime < 0 || currTime > vid.duration) continue;
      const prevImg = await this.extractImageData(vid, prevTime);
      const currImg = await this.extractImageData(vid, currTime);
      pairs.push({ prevTime, currTime, prevImg, currImg });
    }
    return pairs;
  }

  async extractStartPairs(vid: HTMLVideoElement, duration: number, count: number, dt: number) {
    const pairs: any[] = [];
    const step = duration / (count - 1);
    for (let i = 0; i < count; i++) {
      const currTime = i * step;
      const nextTime = currTime + dt;
      if (nextTime > vid.duration) break;
      const currImg = await this.extractImageData(vid, currTime);
      const nextImg = await this.extractImageData(vid, nextTime);
      pairs.push({ currTime, nextTime, currImg, nextImg });
    }
    return pairs;
  }

  async findBestMatch(endPairs: any[], startPairs: any[]): Promise<{ best1: number, best2: number }> {
    let minScore = Infinity, best1 = 0, best2 = 0;
    const threshold = Math.PI / 4;
    const penalty = 1e6;
    for (let i = 0; i < endPairs.length; i++) {
      for (let j = 0; j < startPairs.length; j++) {
        const sim = this.compareFrames(endPairs[i].currImg, startPairs[j].currImg);
        const dir1 = await this.getFlowDir(endPairs[i].prevImg, endPairs[i].currImg);
        const dir2 = await this.getFlowDir(startPairs[j].currImg, startPairs[j].nextImg);
        let angleDiff = Math.abs(dir1 - dir2);
        angleDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff);
        let score = sim;
        if (angleDiff > threshold) score += penalty;
        if (score < minScore) {
          minScore = score;
          best1 = i;
          best2 = j;
        }
      }
    }
    return { best1, best2 };
  }

  compareFrames(img1: ImageData, img2: ImageData): number {
    const cv = (window as any).cv;
    const mat1 = cv.matFromImageData(img1);
    const mat2 = cv.matFromImageData(img2);
    const gray1 = new cv.Mat();
    const gray2 = new cv.Mat();
    cv.cvtColor(mat1, gray1, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(mat2, gray2, cv.COLOR_RGBA2GRAY);
    const diff = new cv.Mat();
    cv.absdiff(gray1, gray2, diff);
    const mean = cv.mean(diff)[0];
    mat1.delete(); mat2.delete(); gray1.delete(); gray2.delete(); diff.delete();
    return mean;
  }

  async getFlowDir(prevImg: ImageData, nextImg: ImageData): Promise<number> {
    const cv = (window as any).cv;
    const matPrev = cv.matFromImageData(prevImg);
    const matNext = cv.matFromImageData(nextImg);
    const grayPrev = new cv.Mat();
    const grayNext = new cv.Mat();
    cv.cvtColor(matPrev, grayPrev, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(matNext, grayNext, cv.COLOR_RGBA2GRAY);
    const flow = new cv.Mat();
    cv.calcOpticalFlowFarneback(grayPrev, grayNext, flow, 0.5, 3, 15, 3, 5, 1.2, 0);
    const flowVec = new cv.MatVector();
    cv.split(flow, flowVec);
    const u = flowVec.get(0);
    const v = flowVec.get(1);
    const meanU = cv.mean(u)[0];
    const meanV = cv.mean(v)[0];
    const dir = Math.atan2(meanV, meanU);
    matPrev.delete(); matNext.delete(); grayPrev.delete(); grayNext.delete();
    flow.delete(); u.delete(); v.delete(); flowVec.delete();
    return dir;
  }
}

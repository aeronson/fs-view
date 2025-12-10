import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class HandyService {
  private baseUrl = 'https://www.handyfeeling.com/api/handy/v2';
  private connectionKey = '';

  constructor(private http: HttpClient) {}

  setConnectionKey(key: string) {
    this.connectionKey = key;
  }

  // General Endpoints

  async connected() {
    const url = `${this.baseUrl}/connected?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.get(url));
  }

  async info() {
    const url = `${this.baseUrl}/info?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.get(url));
  }

  async mode(mode: number) {
    const url = `${this.baseUrl}/mode?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.put(url, { mode }));
  }

  // HSSP Endpoints

  async hsspSetup(scriptUrl: string) {
    const url = `${this.baseUrl}/hssp/setup?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.put(url, { url: scriptUrl }));
  }

  async hsspPlay(playTime: number, serverTime: number) {
    const url = `${this.baseUrl}/hssp/play?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.put(url, { playTime, serverTime }));
  }

  async hsspStop() {
    const url = `${this.baseUrl}/hssp/stop?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.put(url, {}));
  }

  async hsspState() {
    const url = `${this.baseUrl}/hssp/state?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.get(url));
  }

  // Sync Endpoints

  async syncPrepare(scriptData: string) {
    const url = `${this.baseUrl}/sync/prepare?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.put(url, scriptData, { headers: { 'Content-Type': 'application/json' } }));
  }

  async sync() {
    const url = `${this.baseUrl}/sync?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.get(url));
  }

  // Settings Endpoints

  async settings() {
    const url = `${this.baseUrl}/settings?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.get(url));
  }

  async setSettings(settings: any) {
    const url = `${this.baseUrl}/settings?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.put(url, settings));
  }

  // Slide Endpoints

  async slide() {
    const url = `${this.baseUrl}/slide?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.get(url));
  }

  async setSlide(min: number, max: number) {
    const url = `${this.baseUrl}/slide?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.put(url, { min, max }));
  }

  // Firmware Endpoints

  async fwVersion() {
    const url = `${this.baseUrl}/fw/version?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.get(url));
  }

  async otaUpdate(firmwareUrl: string) {
    const url = `${this.baseUrl}/ota?connectionKey=${this.connectionKey}`;
    return lastValueFrom(this.http.put(url, { firmwareUrl }));
  }

  // Add other endpoints if needed based on future updates
}
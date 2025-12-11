import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { marked } from 'marked';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss'],
})
export class ProfileComponent implements OnInit {
  apiKey: string = '';
  prompt: string = 'analyze the subject. create a maximal detail character sheet suitable for 3d rendering. infer and extrapolate a detailed psychological profile.  infer and extrapolate a detailed physical profile.  infer and extrapolate a detailed behavioural profile.  infer and extrapolate a detailed sexual behavioural profile. analyse and describe scene in maximal detail.';
  imageBase64: string = '';
  response: string = '';
  error: string = '';
  messages: any[] = [];
  pipelinePrompts: string[] = [];
  pipelineResponses: string[] = [];

  constructor(private http: HttpClient) { }

  ngOnInit() {
    const storedKey = localStorage.getItem('xai-api-key');
    if (storedKey) {
      this.apiKey = storedKey;
    }
  }

  onCharacterFileChange(event: any) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = () => this.imageBase64 = (reader.result as string).split(',')[1];
    reader.readAsDataURL(file);
  }

  onPipelineFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    this.pipelinePrompts = [];
    for (let i = 0; i < files.length; i++) {
      const reader = new FileReader();
      reader.onload = (e) => this.pipelinePrompts.push(reader.result as string);
      reader.readAsText(files[i]);
    }
  }

  onDownload() {
    let responses = '';
    this.pipelineResponses.forEach((res, idx) => {
      responses += this.pipelineResponses[idx] + '\n\n---\n\n';
    });

    const blob = new Blob([responses], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'character-profile.md';
    a.click();
    URL.revokeObjectURL(url);
  }

  async processPipeline() {
    localStorage.setItem('xai-api-key', this.apiKey);

    for (const pipePrompt of this.pipelinePrompts) {
      this.prompt = pipePrompt;
      this.pipelineResponses.push(await this.sendRequest() ?? '');
    }
    this.pipelinePrompts = [];
  }

  getMarkdownContent(markdown: string) {
    return marked.parse(markdown);
  }

  private async sendRequest(): Promise<string | undefined> {
    const userContent = [{ type: 'text', text: this.prompt, image_url: { url: '' } }];
    if (this.imageBase64) {
      userContent.push({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${this.imageBase64}` },
        text: ''
      });
    }
    const userMessage = { role: 'user', content: userContent };
    this.messages.push(userMessage);
    this.prompt = '';

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json'
    });

    const body = {
      model: 'grok-4',
      messages: this.messages
    };

    try {
      const res: any = await firstValueFrom(this.http.post('https://api.x.ai/v1/chat/completions', body, { headers }));
      const assistantMessage = { role: 'assistant', content: res.choices[0].message.content };
      this.messages.push(assistantMessage);
      return assistantMessage.content;
    } catch (err: any) {
      this.error = err.message;
      return undefined;
    }
  }
}
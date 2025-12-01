import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { marked } from 'marked';

@Component({
  selector: 'app-profile',
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss'],
})
export class ProfileComponent {
  prompt: string = 'analyze the subject. infer and extrapolate a detailed psychological profile.  infer and extrapolate a detailed physical profile.  infer and extrapolate a detailed behavioural profile.  infer and extrapolate a detailed sexual behavioural profile. infer and extrapolate preferred sex techniques for each of the standard sex phases.';
  imageBase64: string = '';
  response: string = '';
  error: string = '';
  messages: any[] = [];

  constructor(private http: HttpClient) { }

  onFileChange(event: any) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onload = () => this.imageBase64 = (reader.result as string).split(',')[1];
    reader.readAsDataURL(file);
  }

  sendRequest() {
    const userContent = [{ type: 'text', text: this.prompt, image_url: { url : ''} }];
    if (this.imageBase64) {
      userContent.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${this.imageBase64}` } } as any);
      this.imageBase64 = '';
    }
    const userMessage = { role: 'user', content: userContent };
    this.messages.push(userMessage);
    this.prompt = '';
    
    const headers = new HttpHeaders({
      'Authorization': 'Bearer API_KE', // Replace with your xAI API key
      'Content-Type': 'application/json'
    });

    const body = {
      model: 'grok-4',
      messages: this.messages
    };

    this.http.post('https://api.x.ai/v1/chat/completions', body, { headers }).subscribe(
      async (res: any) => {
        const assistantMessage = { role: 'assistant', content: res.choices[0].message.content };
        this.messages.push(assistantMessage);

        this.response = await marked.parse(assistantMessage.content);

      },
      err => this.error = err.message
    );
  }

}

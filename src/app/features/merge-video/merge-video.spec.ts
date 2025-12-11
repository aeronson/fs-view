import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MergeVideo } from './merge-video';

describe('MergeVideo', () => {
  let component: MergeVideo;
  let fixture: ComponentFixture<MergeVideo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MergeVideo]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MergeVideo);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

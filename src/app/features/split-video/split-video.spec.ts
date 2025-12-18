import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SplitVideo } from './split-video';

describe('SplitVideoS', () => {
  let component: SplitVideo;
  let fixture: ComponentFixture<SplitVideo>;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SplitVideo]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SplitVideo);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

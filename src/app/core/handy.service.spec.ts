import { TestBed } from '@angular/core/testing';

import { HandyService } from './handy.service';

describe('HandyService', () => {
  let service: HandyService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(HandyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

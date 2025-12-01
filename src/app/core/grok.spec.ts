import { TestBed } from '@angular/core/testing';

import { Grok } from './grok';

describe('Grok', () => {
  let service: Grok;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(Grok);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

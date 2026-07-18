'use strict';

/**
 * js/utils.js attaches everything to window.StadiumPulseUtils rather than
 * using module.exports (see comment in that file — no bundler by design).
 * We load it into the jsdom `window` the same way a <script> tag would.
 */
require('../js/utils.js');
const { escapeHtml, debounce, densityStatus, SUPPORTED_LANGUAGES } = window.StadiumPulseUtils;

describe('escapeHtml', () => {
  test('neutralizes a script tag', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe(
      '&lt;script&gt;alert(1)&lt;/script&gt;',
    );
  });

  test('neutralizes an attribute-breakout attempt', () => {
    const result = escapeHtml('"><img src=x onerror=alert(1)>');
    expect(result).not.toContain('<img');
  });

  test('passes plain text through unchanged', () => {
    expect(escapeHtml('Gate 4, Section 114')).toBe('Gate 4, Section 114');
  });

  test('handles null/undefined without throwing', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('debounce', () => {
  jest.useFakeTimers();

  test('only invokes the wrapped function once after rapid calls', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 200);

    debounced();
    debounced();
    debounced();
    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('passes arguments through to the wrapped function', () => {
    const fn = jest.fn();
    const debounced = debounce(fn, 100);
    debounced('gate', 4);
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('gate', 4);
  });
});

describe('densityStatus', () => {
  test('classifies below 85% as normal', () => {
    expect(densityStatus(0).level).toBe('normal');
    expect(densityStatus(84).level).toBe('normal');
  });

  test('classifies 85–99% as elevated', () => {
    expect(densityStatus(85).level).toBe('elevated');
    expect(densityStatus(99).level).toBe('elevated');
  });

  test('classifies 100% and above as critical', () => {
    expect(densityStatus(100).level).toBe('critical');
    expect(densityStatus(150).level).toBe('critical');
  });
});

describe('SUPPORTED_LANGUAGES', () => {
  test('includes English with no duplicate codes', () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(codes).toContain('en');
    expect(new Set(codes).size).toBe(codes.length);
  });
});

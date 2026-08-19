import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectChallenge } from '../http.js';

describe('access-control detection', () => {
  const challenges: Array<[string, string]> = [
    ['<html><head><title>Just a moment...</title></head></html>', 'CLOUDFLARE_CHALLENGE'],
    ['<div class="cf-browser-verification"></div>', 'CLOUDFLARE_CHALLENGE'],
    ['<script src="https://www.google.com/recaptcha/api.js"></script>', 'CAPTCHA'],
    ['<p>Please verify you are human before continuing.</p>', 'BOT_CHALLENGE'],
    ['Incapsula incident ID: 123-456', 'WAF_CHALLENGE'],
    ['<h1>Access Denied</h1>', 'ACCESS_BLOCKED'],
    ['<form><input type="password" name="pw"></form>', 'AUTH_WALL'],
  ];

  for (const [body, code] of challenges) {
    it(`flags ${code} rather than treating the page as content`, () => {
      assert.equal(detectChallenge(body), code);
    });
  }

  it('passes an ordinary menu page through', () => {
    assert.equal(detectChallenge('<ul><li>Blue Dream 3.5g</li></ul>'), null);
  });
});

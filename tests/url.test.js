import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeRouteUrl,routeFromUrl,redactRoute,redactUrl} from '../src/url.js';

test('preserves queries and repeated values while normalizing identity order',()=>{
 const first=normalizeRouteUrl('https://example.test/app/','/app/search?b=2&a=one&a=two');
 const reordered=normalizeRouteUrl('https://example.test/app/','/app/search?a=one&a=two&b=2');
 assert.equal(first.navigationUrl,'https://example.test/app/search?b=2&a=one&a=two');
 assert.equal(routeFromUrl(first.navigationUrl),'/app/search?b=2&a=one&a=two');
 assert.equal(first.identity,reordered.identity);
 assert.match(first.identity,/a=one&a=two&b=2$/);
});

test('does not reorder signed or security-sensitive query identities',()=>{
 const first=normalizeRouteUrl('https://example.test/app/','/app/file?signature=signed&b=2&a=1');
 const reordered=normalizeRouteUrl('https://example.test/app/','/app/file?a=1&b=2&signature=signed');
 assert.notEqual(first.identity,reordered.identity);
 assert.match(first.identity,/signature=signed&b=2&a=1$/);
});

test('preserves encoded URL values for navigation',()=>{
 const normalized=normalizeRouteUrl('https://example.test/app/','search?q=hello%20world&next=%2Fapp%2Feditor%3Fx%3D1');
 assert.equal(normalized.navigationUrl,'https://example.test/app/search?q=hello%20world&next=%2Fapp%2Feditor%3Fx%3D1');
});

test('keeps SPA hash routes and drops ordinary section fragments',()=>{
 assert.equal(normalizeRouteUrl('https://example.test/','/#/dashboard').navigationUrl,'https://example.test/#/dashboard');
 assert.equal(normalizeRouteUrl('https://example.test/app/','/app/#!/editor?mode=js').navigationUrl,'https://example.test/app/#!/editor?mode=js');
 assert.equal(normalizeRouteUrl('https://example.test/app/','/app/page#details').navigationUrl,'https://example.test/app/page');
});

test('resolves relative, root-relative and protocol-relative URLs within base scope',()=>{
 assert.equal(normalizeRouteUrl('https://example.test/app/','./editor').navigationUrl,'https://example.test/app/editor');
 assert.equal(normalizeRouteUrl('https://example.test/app/','nested/../settings').navigationUrl,'https://example.test/app/settings');
 assert.equal(normalizeRouteUrl('https://example.test/app/','/app/profile').navigationUrl,'https://example.test/app/profile');
 assert.equal(normalizeRouteUrl('https://example.test/app/','//example.test/app/help').navigationUrl,'https://example.test/app/help');
 assert.equal(normalizeRouteUrl('https://example.test/','../root-page').navigationUrl,'https://example.test/root-page');
});

test('rejects unsafe schemes, other origins and paths outside the application base',()=>{
 for(const candidate of ['javascript:alert(1)','data:text/html,hello','mailto:test@example.test','https://evil.test/app/','//evil.test/app/','/admin','../outside']){
  assert.equal(normalizeRouteUrl('https://example.test/app/',candidate),null,candidate);
 }
});

test('removes known tracking parameters without collapsing meaningful query state',()=>{
 const tracked=normalizeRouteUrl('https://example.test/app/','/app/search?q=python&utm_source=newsletter&gclid=abc');
 const plain=normalizeRouteUrl('https://example.test/app/','/app/search?q=python');
 const other=normalizeRouteUrl('https://example.test/app/','/app/search?q=javascript');
 assert.equal(tracked.navigationUrl,'https://example.test/app/search?q=python');
 assert.equal(tracked.identity,plain.identity);
 assert.notEqual(plain.identity,other.identity);
});

test('redacts sensitive query values in normal and SPA routes',()=>{
 const absolute=redactUrl('https://example.test/app/private?token=secret&view=full#/editor?session=hash-secret&mode=js');
 assert.doesNotMatch(absolute,/secret/);
 assert.match(absolute,/token=%5BREDACTED%5D/);
 assert.match(absolute,/session=%5BREDACTED%5D/);
 assert.match(absolute,/view=full/);
 assert.match(absolute,/mode=js/);
 const route=redactRoute('/app/private?api_key=private-value&tab=one','https://example.test/app/');
 assert.equal(route,'/app/private?api_key=%5BREDACTED%5D&tab=one');
});

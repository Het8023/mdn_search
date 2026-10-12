import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryFromMdnUrl, parseMdnPageHtml, selectPropertyDocument, toPlainText } from '../src/services/mdnClient';

test('selects the exact CSS property result instead of similarly named results', () => {
  const result = selectPropertyDocument([
    {
      mdn_url: '/zh-CN/docs/Web/SVG/Reference/Attribute/display',
      title: 'display',
      locale: 'zh-cn',
      summary: 'SVG definition'
    },
    {
      mdn_url: '/zh-CN/docs/Web/CSS/Reference/Properties/display',
      title: 'display',
      locale: 'zh-cn',
      summary: 'CSS definition'
    }
  ], 'display');
  assert.equal(result?.summary, 'CSS definition');
});

test('strips markup from remote summaries', () => {
  assert.equal(toPlainText('The <code>display</code> &amp; value.'), 'The display & value.');
  assert.equal(toPlainText('<canvas> HTML element'), '<canvas> HTML element');
});

test('classifies MDN document categories', () => {
  assert.equal(categoryFromMdnUrl('/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Array/map'), 'JavaScript');
  assert.equal(categoryFromMdnUrl('/zh-CN/docs/Web/API/Fetch_API'), 'Web API');
  assert.equal(categoryFromMdnUrl('/zh-CN/docs/Web/HTTP/Reference/Headers/Content-Type'), 'HTTP');
});

test('parses useful MDN page sections into safe content blocks', () => {
  const detail = parseMdnPageHtml(`
    <main id="content">
      <div class="baseline-indicator">Widely available</div>
      <h1>Array.prototype.map()</h1>
      <h2 id="syntax">语法</h2>
      <pre><code class="language-js">map(callbackFn)</code></pre>
      <h2 id="parameters">参数</h2>
      <dl><dt>callbackFn</dt><dd>为数组中每个元素执行的函数。</dd></dl>
      <h2 id="examples">示例</h2>
      <h3>数字翻倍</h3>
      <pre><code class="language-js">[1, 2].map((x) =&gt; x * 2)</code></pre>
      <h2 id="compat">浏览器兼容性</h2>
      <p>Large compatibility table</p>
    </main>
  `, {
    title: 'Array.prototype.map()',
    summary: '创建一个新数组。',
    mdnUrl: 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Array/map',
    locale: 'zh-CN',
    category: 'JavaScript'
  });

  assert.equal(detail.baseline, 'Widely available');
  assert.deepEqual(detail.sections.map((section) => section.title), ['语法', '参数', '示例']);
  assert.equal(detail.sections[0].blocks[0].type, 'code');
  assert.equal(detail.sections[1].blocks[0].type, 'list');
  assert.equal(detail.sections[2].blocks[0].type, 'subheading');
});

(function () {
  const vscode = acquireVsCodeApi();
  const form = document.getElementById('search-form');
  const input = document.getElementById('search-input');
  const content = document.getElementById('content');
  const historySection = document.getElementById('history-section');
  const historyList = document.getElementById('history-list');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    if (query) vscode.postMessage({ type: 'search', query });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.type === 'state') renderState(message.state);
    if (message.type === 'focusSearch') input.focus();
  });

  function renderState(state) {
    replaceChildren(content);
    renderHistory(state.history || []);

    if (state.kind === 'empty') {
      content.append(createEmpty('暂无查询结果'));
      return;
    }
    if (state.kind === 'loading') {
      input.value = state.query;
      const loading = createElement('div', 'state-message');
      loading.setAttribute('role', 'status');
      loading.append(createElement('span', 'spinner'), document.createTextNode('正在查询...'));
      content.append(loading);
      return;
    }
    if (state.kind === 'notFound') {
      input.value = state.result.query;
      content.append(createEmpty(`未找到 “${state.result.query}”`));
      renderSuggestions(state.result.suggestions || []);
      if (state.result.error) content.append(createNotice(state.result.error));
      return;
    }

    if (state.kind === 'detail') {
      input.value = state.query;
      content.append(renderPageDetail(state.detail, state.error));
      return;
    }

    const result = state.result;
    input.value = result.definition ? result.definition.name : result.query;
    if (result.definition) {
      content.append(renderDefinition(result.definition));
    } else {
      content.append(renderDocuments(result.documents || []));
    }
    if (result.error) content.append(createNotice('在线内容暂不可用，当前展示本地数据。'));
  }

  function renderDocuments(documents) {
    const fragment = document.createDocumentFragment();
    const heading = createElement('div', 'results-heading');
    const title = document.createElement('h1');
    title.textContent = 'MDN 搜索结果';
    const count = createElement('span', 'result-count');
    count.textContent = `${documents.length} 项`;
    heading.append(title, count);
    fragment.append(heading);

    const list = createElement('div', 'document-results');
    for (const documentResult of documents) {
      const article = document.createElement('article');
      article.className = 'document-result';

      const meta = createElement('div', 'document-meta');
      const category = createElement('span', 'document-category');
      category.textContent = documentResult.category;
      const locale = createElement('span', 'document-locale');
      locale.textContent = documentResult.locale === 'zh-CN' ? '中文' : 'English';
      meta.append(category, locale);

      const titleButton = document.createElement('button');
      titleButton.type = 'button';
      titleButton.className = 'document-title';
      titleButton.textContent = documentResult.title;
      titleButton.title = '在侧边栏查看详情';
      titleButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'showDetail', document: documentResult });
      });

      const summary = document.createElement('p');
      summary.textContent = documentResult.summary;
      const actions = createElement('div', 'document-actions');
      const detailButton = document.createElement('button');
      detailButton.type = 'button';
      detailButton.textContent = '查看详情';
      detailButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'showDetail', document: documentResult });
      });
      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.textContent = '在 MDN 打开';
      openButton.addEventListener('click', () => {
        vscode.postMessage({ type: 'openExternal', url: documentResult.mdnUrl });
      });
      actions.append(detailButton, openButton);
      article.append(meta, titleButton, summary, actions);
      list.append(article);
    }
    fragment.append(list);

    const attribution = createElement('small', 'results-attribution');
    attribution.textContent = '内容来源：MDN Web Docs / Mozilla Contributors';
    fragment.append(attribution);
    return fragment;
  }

  function renderPageDetail(detail, error) {
    const fragment = document.createDocumentFragment();
    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'back-button';
    backButton.textContent = '← 返回搜索结果';
    backButton.addEventListener('click', () => vscode.postMessage({ type: 'backToResults' }));
    fragment.append(backButton);

    const header = createElement('header', 'page-detail-header');
    const meta = createElement('div', 'document-meta');
    const category = createElement('span', 'document-category');
    category.textContent = detail.category;
    const locale = createElement('span', 'document-locale');
    locale.textContent = detail.locale === 'zh-CN' ? '中文' : 'English';
    meta.append(category, locale);
    const title = document.createElement('h1');
    title.textContent = detail.title;
    header.append(meta, title);
    fragment.append(header);

    const overview = createSection('概述');
    const summary = document.createElement('p');
    summary.textContent = detail.summary;
    overview.append(summary);
    fragment.append(overview);

    if (detail.baseline) {
      const baseline = createElement('p', 'baseline');
      baseline.textContent = detail.baseline;
      fragment.append(baseline);
    }

    for (const sectionData of detail.sections || []) {
      const section = createSection(sectionData.title);
      for (const block of sectionData.blocks || []) {
        section.append(renderContentBlock(block));
      }
      fragment.append(section);
    }

    if (!detail.sections || detail.sections.length === 0) {
      fragment.append(createNotice(error || '没有取得更多章节内容。'));
    }

    const footer = createElement('footer', 'source');
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'primary-action';
    openButton.textContent = '在 MDN 中查看完整文档';
    openButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'openExternal', url: detail.mdnUrl });
    });
    const attribution = document.createElement('small');
    attribution.textContent = '内容来源：MDN Web Docs / Mozilla Contributors';
    footer.append(openButton, attribution);
    fragment.append(footer);
    return fragment;
  }

  function renderContentBlock(block) {
    if (block.type === 'code') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = block.text || '';
      if (block.language) code.setAttribute('data-language', block.language);
      pre.append(code);
      return pre;
    }
    if (block.type === 'list') {
      const list = document.createElement('ul');
      list.className = 'content-list';
      for (const item of block.items || []) {
        const listItem = document.createElement('li');
        listItem.textContent = item;
        list.append(listItem);
      }
      return list;
    }
    if (block.type === 'subheading') {
      const heading = document.createElement('h3');
      heading.textContent = block.text || '';
      return heading;
    }
    const paragraph = document.createElement('p');
    paragraph.textContent = block.text || '';
    return paragraph;
  }

  function renderDefinition(definition) {
    const fragment = document.createDocumentFragment();
    const header = createElement('header', 'definition-header');
    const title = document.createElement('h1');
    const code = document.createElement('code');
    code.textContent = definition.name;
    title.append(code);
    header.append(title, renderStatus(definition.status));
    fragment.append(header);

    const summary = createElement('section', 'definition-section');
    const paragraph = document.createElement('p');
    paragraph.textContent = definition.summary || '在线定义暂不可用。';
    summary.append(paragraph);
    if (definition.locale === 'en-US' && definition.summary) {
      const fallback = createElement('p', 'subtle');
      fallback.textContent = '中文内容暂缺，当前显示英文定义。';
      summary.append(fallback);
    }
    fragment.append(summary);

    if (definition.syntax) {
      const syntax = createSection('语法');
      const syntaxCode = document.createElement('code');
      syntaxCode.className = 'syntax';
      syntaxCode.textContent = definition.syntax;
      syntax.append(syntaxCode);
      fragment.append(syntax);
    }

    const metadata = createSection('属性信息');
    const list = createElement('dl', 'metadata');
    addMetadata(list, '初始值', definition.initialValue);
    addMetadata(list, '继承', definition.inherited === true ? '是' : definition.inherited === false ? '否' : undefined);
    addMetadata(list, '适用范围', humanize(definition.appliesTo));
    addMetadata(list, '计算值', humanize(definition.computedValue));
    addMetadata(list, '动画类型', humanize(definition.animationType));
    metadata.append(list);
    fragment.append(metadata);

    if (definition.compatibility && definition.compatibility.length) {
      const compatibility = createSection('兼容性');
      const listElement = createElement('ul', 'compatibility');
      for (const item of definition.compatibility) {
        const row = document.createElement('li');
        const browser = document.createElement('span');
        browser.textContent = item.browser;
        const version = document.createElement('strong');
        version.textContent = item.version === true ? '支持' : `${item.version}+`;
        row.append(browser, version);
        listElement.append(row);
      }
      compatibility.append(listElement);
      fragment.append(compatibility);
    }

    const footer = createElement('footer', 'source');
    const details = document.createElement('button');
    details.type = 'button';
    details.className = 'primary-action';
    details.textContent = '查看详细章节';
    details.addEventListener('click', () => {
      vscode.postMessage({
        type: 'showDetail',
        document: {
          title: definition.name,
          summary: definition.summary || '在线定义暂不可用。',
          mdnUrl: definition.mdnUrl,
          locale: definition.locale,
          category: 'CSS'
        }
      });
    });
    const link = document.createElement('button');
    link.type = 'button';
    link.className = 'link-button';
    link.textContent = '在 MDN 中查看完整文档';
    link.addEventListener('click', () => vscode.postMessage({ type: 'openExternal', url: definition.mdnUrl }));
    const attribution = document.createElement('small');
    attribution.textContent = '内容来源：MDN Web Docs / Mozilla Contributors';
    footer.append(details, link, attribution);
    fragment.append(footer);
    return fragment;
  }

  function renderStatus(status) {
    const element = createElement('span', 'status');
    if (status.deprecated) {
      element.classList.add('status-warning');
      element.textContent = '已废弃';
    } else if (status.experimental) {
      element.classList.add('status-experimental');
      element.textContent = '实验性';
    } else {
      element.classList.add('status-standard');
      element.textContent = '标准';
    }
    return element;
  }

  function renderSuggestions(suggestions) {
    if (!suggestions.length) return;
    const section = createSection('相近属性');
    const list = createElement('div', 'suggestions');
    for (const suggestion of suggestions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = suggestion;
      button.addEventListener('click', () => vscode.postMessage({ type: 'search', query: suggestion }));
      list.append(button);
    }
    section.append(list);
    content.append(section);
  }

  function renderHistory(history) {
    replaceChildren(historyList);
    historySection.hidden = history.length === 0;
    for (const item of history) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item;
      button.addEventListener('click', () => vscode.postMessage({ type: 'selectHistory', query: item }));
      historyList.append(button);
    }
  }

  function createSection(titleText) {
    const section = createElement('section', 'definition-section');
    const title = document.createElement('h2');
    title.textContent = titleText;
    section.append(title);
    return section;
  }

  function addMetadata(list, label, value) {
    if (!value) return;
    const term = document.createElement('dt');
    term.textContent = label;
    const detail = document.createElement('dd');
    detail.textContent = value;
    list.append(term, detail);
  }

  function humanize(value) {
    if (!value) return undefined;
    const known = {
      allElements: '所有元素',
      allElementsAndText: '所有元素和文本',
      blockContainers: '块容器',
      positionedElements: '定位元素',
      absoluteLength: '绝对长度',
      asSpecified: '指定值',
      byComputedValueType: '按计算值类型'
    };
    return known[value] || value.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  }

  function createEmpty(text) {
    const element = createElement('p', 'state-message');
    element.textContent = text;
    return element;
  }

  function createNotice(text) {
    const element = createElement('p', 'notice');
    element.textContent = text;
    return element;
  }

  function createElement(tag, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    return element;
  }

  function replaceChildren(element) {
    while (element.firstChild) element.firstChild.remove();
  }

  vscode.postMessage({ type: 'ready' });
})();

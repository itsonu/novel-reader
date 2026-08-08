// Tokenise from the RENDERED DOM, never from markdown source — otherwise offsets
// desync at the first italic. Verified: 2,337 spans across a chapter, contiguous
// indices through <em> interiors and quoted dialogue.

export type Token = { el: HTMLElement; text: string; block: Element | null };
export type Sentence = [start: number, end: number];

export function wrapWords(root: HTMLElement): Token[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) if ((n as Text).data.trim()) nodes.push(n as Text);

  const out: Token[] = [];
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.data.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
      const s = document.createElement('span');
      s.className = 'w';
      s.dataset.i = String(out.length);
      s.textContent = part;
      frag.appendChild(s);
      out.push({ el: s, text: part, block: null });
    }
    node.parentNode!.replaceChild(frag, node);
  }
  for (const t of out)
    t.block = t.el.closest('p,h1,h2,h3,h4,li,blockquote') ?? t.el.parentElement;
  return out;
}

const ABBR = /^(mr|mrs|ms|dr|st|prof|sr|jr|vs|etc|e\.g|i\.e)\.$/i;

export function groupSentences(tokens: Token[]): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].text;
    const ends = /[.!?…]["'”’)\]]*$/.test(t) && !ABBR.test(t) && !/^[A-Z]\.$/.test(t);
    const blockBreak = i + 1 < tokens.length && tokens[i + 1].block !== tokens[i].block;
    if (ends || blockBreak || i - start >= 45 || i === tokens.length - 1) {
      out.push([start, i]);
      start = i + 1;
    }
  }
  return out.filter(([a, b]) => b >= a);
}

export const sentenceTokens = (tokens: Token[], [a, b]: Sentence) =>
  tokens.slice(a, b + 1).map(t => t.text);

export const sentenceText = (tokens: Token[], s: Sentence) => sentenceTokens(tokens, s).join(' ');

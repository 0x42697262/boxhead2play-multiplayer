import { describe, expect, it } from 'vitest';
import { child, decodeEntities, items, parseXml, XmlParseError } from './parseXml.ts';

describe('parseXml', () => {
  it('builds an element tree with attributes, text and self-closing tags', () => {
    const root = parseXml(
      '<?xml version="1.0"?><!-- note --><swf version="8"><tags><item type="A" name="x &amp; y"/><item>42</item></tags></swf>',
    );
    expect(root.name).toBe('swf');
    expect(root.attributes['version']).toBe('8');
    const tags = items(child(root, 'tags'));
    expect(tags).toHaveLength(2);
    expect(tags[0]?.attributes['name']).toBe('x & y');
    expect(tags[1]?.text).toBe('42');
  });

  it('keeps > characters inside quoted attribute values', () => {
    const root = parseXml('<a text="1 > 0"><b/></a>');
    expect(root.attributes['text']).toBe('1 > 0');
    expect(root.children[0]?.name).toBe('b');
  });

  it('decodes named and numeric entities', () => {
    expect(decodeEntities('&lt;p&gt; &quot;a&quot; &#65;&#x42;')).toBe('<p> "a" AB');
  });

  it('rejects mismatched closing tags', () => {
    expect(() => parseXml('<a><b></a>')).toThrow(XmlParseError);
  });
});

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { findPersonMention, personMentionNameForms } from './landmarkPersonMentions';
import { isLikelyRealPersonName, isPlaceOrNonPersonPhrase } from './landmarkPersonNameGate';
import { normalizeLandmarkStoryProse } from './landmarkStoryProse';

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  introFormattedBody: {
    paddingTop: 2,
  },
  introFormattedBodyCompactTop: { paddingTop: 0 },
  introLeadParagraph: {
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 16,
    letterSpacing: 0.04,
  },
  introEmphasisParagraph: {
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 16,
    letterSpacing: 0.02,
  },
  introParagraph: {
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 16,
  },
  introParagraphPreHero: { marginBottom: 6 },
  introSectionHeadingWrap: {
    marginBottom: 14,
    marginTop: 10,
  },
  introSectionHeadingWrapPreHero: { marginBottom: 6 },
  introSectionHeadingRule: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 10,
  },
  introSectionHeading: {
    fontSize: 21,
    lineHeight: 28,
    letterSpacing: 0.15,
  },
});

// ─── Helper functions ──────────────────────────────────────────────────────

function isIntroSectionHeading(_block) {
  // Story pages never use section title blocks — always render as body copy.
  return false;
}

function parseIntroBodyBlocks(text) {
  const blocks = normalizeLandmarkStoryProse(text)
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      type: isIntroSectionHeading(block) ? 'heading' : 'paragraph',
      text: block,
    }));
  // Drop consecutive duplicate paragraphs (same text after whitespace normalize)
  const out = [];
  let prevNorm = '';
  for (const block of blocks) {
    const norm = String(block.text || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    if (block.type === 'paragraph' && norm && norm === prevNorm) continue;
    out.push(block);
    if (block.type === 'paragraph') prevNorm = norm;
  }
  return out;
}

function splitPlainWithPersonLinks(plain, personMentions) {
  const src = String(plain || '');
  if (!src) return [];
  // ONLY highlight names we already resolved as real people (with optional photo).
  // Do NOT auto-link random Capitalized Phrases (streets, places, etc.).
  const known = personMentionNameForms(personMentions).filter(
    (n) => isLikelyRealPersonName(n) && !isPlaceOrNonPersonPhrase(n),
  );
  const marks = [];

  for (const name of known) {
    let from = 0;
    while (from < src.length) {
      const idx = src.indexOf(name, from);
      if (idx < 0) break;
      const overlaps = marks.some((m) => !(idx + name.length <= m.start || idx >= m.end));
      if (!overlaps) {
        marks.push({
          start: idx,
          end: idx + name.length,
          text: name,
          mention: findPersonMention(personMentions, name),
        });
      }
      from = idx + name.length;
    }
  }

  marks.sort((a, b) => a.start - b.start || b.end - a.end);
  if (!marks.length) return [{ type: 'plain', text: src }];

  const out = [];
  let cursor = 0;
  for (const mark of marks) {
    if (mark.start < cursor) continue;
    if (mark.start > cursor) out.push({ type: 'plain', text: src.slice(cursor, mark.start) });
    out.push({ type: 'person', text: mark.text, mention: mark.mention || null });
    cursor = mark.end;
  }
  if (cursor < src.length) out.push({ type: 'plain', text: src.slice(cursor) });
  return out.length ? out : [{ type: 'plain', text: src }];
}

function parseTextSegments(text, personMentions) {
  const src = String(text || '');
  if (!src) return [];
  const out = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let match;
  while ((match = re.exec(src)) !== null) {
    if (match.index > last) {
      out.push(...splitPlainWithPersonLinks(src.slice(last, match.index), personMentions));
    }
    out.push({
      type: 'emphasis',
      text: match[1],
      mention: findPersonMention(personMentions, match[1]),
    });
    last = match.index + match[0].length;
  }
  if (last < src.length) {
    out.push(...splitPlainWithPersonLinks(src.slice(last), personMentions));
  }
  return out.length ? out : [{ type: 'plain', text: src }];
}

// ─── Components ────────────────────────────────────────────────────────────

function TextWithEmphasis({ text, emphasisColor, personMentions, personLinkColor, onPersonPress }) {
  const segments = useMemo(
    () => parseTextSegments(text, personMentions),
    [text, personMentions],
  );

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'plain') return seg.text;
        const mention = seg.mention || findPersonMention(personMentions, seg.text);
        // Only real people from the story roster (prefer ones with a portrait).
        // Never turn streets / random phrases into blue links.
        const isKnownPerson =
          !!mention &&
          isLikelyRealPersonName(seg.text) &&
          !isPlaceOrNonPersonPhrase(seg.text) &&
          (seg.type === 'person' || seg.type === 'emphasis');
        const tappable =
          typeof onPersonPress === 'function' && isKnownPerson && !!mention?.photoUri;
        if (tappable) {
          return (
            <Text
              key={`e-${i}`}
              style={{
                color: personLinkColor || emphasisColor,
                fontWeight: '700',
                textDecorationLine: 'underline',
              }}
              onPress={() => onPersonPress(seg.text, mention || null)}
              accessibilityRole="link"
              accessibilityLabel={seg.text}
            >
              {seg.text}
            </Text>
          );
        }
        if (seg.type === 'emphasis') {
          return (
            <Text key={`e-${i}`} style={{ color: emphasisColor, fontWeight: '600' }}>
              {seg.text}
            </Text>
          );
        }
        return seg.text;
      })}
    </>
  );
}

function TextWithOptionalUrls({
  children,
  style,
  linkColor,
  emphasisColor,
  personMentions,
  personLinkColor,
  onPersonPress,
}) {
  const text = String(children ?? '');
  const hasPersonHints =
    /\*\*/.test(text) || personMentionNameForms(personMentions).some((n) => text.includes(n));
  if (!/(https?:\/\/)/i.test(text) && !hasPersonHints) {
    return <Text style={style}>{text}</Text>;
  }
  const parts = text.split(/(https?:\/\/[^\s]+)/gi);
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        /^https?:\/\//i.test(part) ? (
          <Text
            key={`u-${i}`}
            style={{ color: linkColor, textDecorationLine: 'underline' }}
            onPress={() => WebBrowser.openBrowserAsync(part).catch(() => {})}
          >
            {part}
          </Text>
        ) : (
          <TextWithEmphasis
            key={`t-${i}`}
            text={part}
            emphasisColor={emphasisColor}
            personMentions={personMentions}
            personLinkColor={personLinkColor}
            onPersonPress={onPersonPress}
          />
        ),
      )}
    </Text>
  );
}

const LandmarkIntroFormattedBody = React.memo(function LandmarkIntroFormattedBody({
  text,
  isLight,
  accent,
  titleColor,
  bodyColor,
  bodyLinkColor,
  emphasisColor,
  brandFontSans,
  brandFontHeadMedium,
  leadOnly = false,
  uniformParagraphs = false,
  compactPreHero = false,
  compactTop = false,
  personMentions,
  onPersonPress,
}) {
  const blocks = useMemo(() => {
    const parsed = parseIntroBodyBlocks(text);
    if (uniformParagraphs) {
      return parsed.map((block) => ({ ...block, type: 'paragraph' }));
    }
    return parsed;
  }, [text, uniformParagraphs]);
  const lastIdx = blocks.length - 1;
  void leadOnly;
  const personLinkColor = bodyLinkColor || accent;

  return (
    <View style={[styles.introFormattedBody, compactTop && styles.introFormattedBodyCompactTop]}>
      {blocks.map((block, idx) => {
        if (block.type === 'heading') {
          return (
            <View
              key={`h-${idx}`}
              style={[
                styles.introSectionHeadingWrap,
                compactPreHero && idx === lastIdx && styles.introSectionHeadingWrapPreHero,
              ]}
            >
              <Text
                style={[
                  styles.introSectionHeading,
                  brandFontHeadMedium,
                  { color: titleColor },
                ]}
              >
                <TextWithEmphasis
                  text={block.text}
                  emphasisColor={emphasisColor}
                  personMentions={personMentions}
                  personLinkColor={personLinkColor}
                  onPersonPress={onPersonPress}
                />
              </Text>
            </View>
          );
        }
        const isLead = false;
        const isEmphasisLead = false;
        const isLast = idx === lastIdx;
        return (
          <TextWithOptionalUrls
            key={`p-${idx}`}
            style={[
              styles.introParagraph,
              compactPreHero && isLast && styles.introParagraphPreHero,
              brandFontSans,
              { color: bodyColor },
            ]}
            linkColor={bodyLinkColor}
            emphasisColor={emphasisColor}
            personMentions={personMentions}
            personLinkColor={personLinkColor}
            onPersonPress={onPersonPress}
          >
            {block.text}
          </TextWithOptionalUrls>
        );
      })}
    </View>
  );
});

export {
  TextWithOptionalUrls,
  TextWithEmphasis,
  isIntroSectionHeading,
  parseIntroBodyBlocks,
  LandmarkIntroFormattedBody,
};

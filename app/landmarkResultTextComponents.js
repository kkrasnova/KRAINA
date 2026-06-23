import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

// ─── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  introFormattedBody: {
    paddingTop: 2,
  },
  introFormattedBodyCompactTop: { paddingTop: 0 },
  introLeadParagraph: {
    fontSize: 20,
    lineHeight: 30,
    marginBottom: 20,
    letterSpacing: 0.04,
  },
  introEmphasisParagraph: {
    fontSize: 18,
    lineHeight: 28,
    marginBottom: 22,
    letterSpacing: 0.02,
  },
  introParagraph: {
    fontSize: 16,
    lineHeight: 26,
    marginBottom: 18,
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

function isIntroSectionHeading(block) {
  const t = String(block || '').trim();
  if (!t || t.length > 96) return false;
  const sentences = t.split(/(?<=[.!?…])\s+/).filter(Boolean);
  if (sentences.length !== 1) return false;
  if (t.length > 72 && /[,;:—–-]/.test(t)) return false;
  return true;
}

function parseIntroBodyBlocks(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({
      type: isIntroSectionHeading(block) ? 'heading' : 'paragraph',
      text: block,
    }));
}

// ─── Components ────────────────────────────────────────────────────────────

function TextWithEmphasis({ text, emphasisColor }) {
  const segments = useMemo(() => {
    const src = String(text || '');
    if (!/\*\*/.test(src)) return [{ type: 'plain', text: src }];
    const out = [];
    const re = /\*\*([^*]+)\*\*/g;
    let last = 0;
    let match;
    while ((match = re.exec(src)) !== null) {
      if (match.index > last) out.push({ type: 'plain', text: src.slice(last, match.index) });
      out.push({ type: 'emphasis', text: match[1] });
      last = match.index + match[0].length;
    }
    if (last < src.length) out.push({ type: 'plain', text: src.slice(last) });
    return out.length ? out : [{ type: 'plain', text: src }];
  }, [text]);

  return (
    <>
      {segments.map((seg, i) =>
        seg.type === 'emphasis' ? (
          <Text key={`e-${i}`} style={{ color: emphasisColor, fontWeight: '600' }}>
            {seg.text}
          </Text>
        ) : (
          seg.text
        ),
      )}
    </>
  );
}

function TextWithOptionalUrls({ children, style, linkColor, emphasisColor }) {
  const text = String(children ?? '');
  if (!/(https?:\/\/)/i.test(text) && !/\*\*/.test(text)) {
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
          <TextWithEmphasis key={`t-${i}`} text={part} emphasisColor={emphasisColor} />
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
}) {
  const blocks = useMemo(() => {
    const parsed = parseIntroBodyBlocks(text);
    if (uniformParagraphs) {
      return parsed.map((block) => ({ ...block, type: 'paragraph' }));
    }
    return parsed;
  }, [text, uniformParagraphs]);
  const mutedBody = isLight ? '#4A4A4A' : 'rgba(242,242,234,0.88)';
  const lastIdx = blocks.length - 1;

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
              <View style={[styles.introSectionHeadingRule, { backgroundColor: accent }]} />
              <Text
                style={[
                  styles.introSectionHeading,
                  brandFontHeadMedium,
                  { color: titleColor },
                ]}
              >
                <TextWithEmphasis text={block.text} emphasisColor={emphasisColor} />
              </Text>
            </View>
          );
        }
        const isLead = !uniformParagraphs && idx === 0;
        const isEmphasisLead = leadOnly && idx === 0 && !uniformParagraphs;
        const isLast = idx === lastIdx;
        return (
          <TextWithOptionalUrls
            key={`p-${idx}`}
            style={[
              styles.introParagraph,
              isLead && styles.introLeadParagraph,
              isEmphasisLead && styles.introEmphasisParagraph,
              compactPreHero && isLast && styles.introParagraphPreHero,
              brandFontSans,
              { color: uniformParagraphs || isLead ? bodyColor : mutedBody },
            ]}
            linkColor={bodyLinkColor}
            emphasisColor={emphasisColor}
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

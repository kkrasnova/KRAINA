import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Platform, Switch } from 'react-native';
import { st } from './settingsI18n';
import { normalizeLandmarkStory } from './landmarkStorySchema';
import { buildAiStoryDraft } from './adminLandmarkAiAssist';

export default function AdminLandmarkStoryFields({
  language,
  story: storyProp,
  onChangeStory,
  textMain,
  muted,
  border,
  accent,
  ripple,
  isLight,
}) {
  const story = normalizeLandmarkStory(storyProp);
  const langUk = String(language || 'en').split(/[-_]/)[0].toLowerCase() === 'uk';
  const [aiTitleUk, setAiTitleUk] = useState('');
  const [aiTitleEn, setAiTitleEn] = useState('');
  const [aiDescUk, setAiDescUk] = useState('');
  const [aiDescEn, setAiDescEn] = useState('');
  const [aiMapsUrl, setAiMapsUrl] = useState('');
  const [aiOldUri, setAiOldUri] = useState('');
  const [aiNewUri, setAiNewUri] = useState('');
  const [aiBgUri, setAiBgUri] = useState('');

  const patch = (updater) => {
    onChangeStory(normalizeLandmarkStory(updater({ ...story, quiz: { ...story.quiz, options: story.quiz.options.map((o) => ({ ...o })) } })));
  };

  const inputStyle = [styles.input, { color: textMain, borderColor: border }];
  const aiCoordsPreview = useMemo(() => {
    const out = buildAiStoryDraft({
      titleUk: aiTitleUk,
      titleEn: aiTitleEn,
      descUk: aiDescUk,
      descEn: aiDescEn,
      mapsUrl: aiMapsUrl,
      oldUri: aiOldUri,
      newUri: aiNewUri,
      bgUri: aiBgUri,
    });
    return out.coords;
  }, [aiTitleUk, aiTitleEn, aiDescUk, aiDescEn, aiMapsUrl, aiOldUri, aiNewUri, aiBgUri]);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionTitle, { color: accent }]}>{langUk ? 'AI-помічник (автозаповнення)' : 'AI assistant (autofill)'}</Text>
      <Text style={[styles.hint, { color: muted }]}>
        {langUk
          ? 'Вставте назву, опис, Google Maps URL, старе/нове фото — і натисніть «Згенерувати».'
          : 'Paste title, description, Google Maps URL, old/new photos and tap Generate.'}
      </Text>
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminTitleUk')}</Text>
      <TextInput value={aiTitleUk} onChangeText={setAiTitleUk} style={inputStyle} placeholderTextColor={muted} />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminTitleEn')}</Text>
      <TextInput value={aiTitleEn} onChangeText={setAiTitleEn} style={inputStyle} placeholderTextColor={muted} />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminDescUk')}</Text>
      <TextInput value={aiDescUk} onChangeText={setAiDescUk} style={[...inputStyle, styles.tall]} multiline textAlignVertical="top" placeholderTextColor={muted} />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminDescEn')}</Text>
      <TextInput value={aiDescEn} onChangeText={setAiDescEn} style={[...inputStyle, styles.tall]} multiline textAlignVertical="top" placeholderTextColor={muted} />
      <Text style={[styles.label, { color: muted }]}>{langUk ? 'Google Maps URL локації' : 'Google Maps location URL'}</Text>
      <TextInput
        value={aiMapsUrl}
        onChangeText={setAiMapsUrl}
        style={inputStyle}
        autoCapitalize="none"
        keyboardType="url"
        placeholder="https://maps.google.com/..."
        placeholderTextColor={muted}
      />
      {aiCoordsPreview ? (
        <Text style={[styles.hint, { color: accent, marginTop: 6, marginBottom: 4 }]}>
          {langUk
            ? `Координати з URL: ${aiCoordsPreview.lat.toFixed(6)}, ${aiCoordsPreview.lng.toFixed(6)}`
            : `Coordinates: ${aiCoordsPreview.lat.toFixed(6)}, ${aiCoordsPreview.lng.toFixed(6)}`}
        </Text>
      ) : null}
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmOldUri')}</Text>
      <TextInput value={aiOldUri} onChangeText={setAiOldUri} style={inputStyle} autoCapitalize="none" keyboardType="url" placeholder="https://..." placeholderTextColor={muted} />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmNewUri')}</Text>
      <TextInput value={aiNewUri} onChangeText={setAiNewUri} style={inputStyle} autoCapitalize="none" keyboardType="url" placeholder="https://..." placeholderTextColor={muted} />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmBgUri')}</Text>
      <TextInput value={aiBgUri} onChangeText={setAiBgUri} style={inputStyle} autoCapitalize="none" keyboardType="url" placeholder="https://..." placeholderTextColor={muted} />
      <Pressable
        onPress={() => {
          const out = buildAiStoryDraft({
            titleUk: aiTitleUk,
            titleEn: aiTitleEn,
            descUk: aiDescUk,
            descEn: aiDescEn,
            mapsUrl: aiMapsUrl,
            oldUri: aiOldUri,
            newUri: aiNewUri,
            bgUri: aiBgUri,
          });
          patch((s) => ({
            ...s,
            ...out.storyPatch,
          }));
        }}
        style={({ pressed }) => [
          styles.correctBtn,
          {
            marginTop: 12,
            borderColor: accent,
            backgroundColor: isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.1)',
            opacity: pressed ? 0.86 : 1,
          },
        ]}
        android_ripple={ripple}
      >
        <Text style={[styles.correctBtnTxt, { color: accent }]}>
          {langUk ? 'Згенерувати AI-чернетку' : 'Generate AI draft'}
        </Text>
      </Pressable>

      <Text style={[styles.sectionTitle, { color: accent }]}>{st(language, 'adminLmInteractiveTitle')}</Text>
      <Text style={[styles.hint, { color: muted }]}>{st(language, 'adminLmInteractiveHint')}</Text>

      <Text style={[styles.subTitle, { color: textMain }]}>{st(language, 'adminLmMeta')}</Text>
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmBuiltAt')}</Text>
      <TextInput
        value={story.builtAt}
        onChangeText={(t) => patch((s) => ({ ...s, builtAt: t }))}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={muted}
        style={inputStyle}
      />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmShortIntroUk')}</Text>
      <TextInput
        value={story.shortIntroUk}
        onChangeText={(t) => patch((s) => ({ ...s, shortIntroUk: t }))}
        style={[...inputStyle, styles.tall]}
        multiline
        textAlignVertical="top"
        placeholderTextColor={muted}
      />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmShortIntroEn')}</Text>
      <TextInput
        value={story.shortIntroEn}
        onChangeText={(t) => patch((s) => ({ ...s, shortIntroEn: t }))}
        style={[...inputStyle, styles.tall]}
        multiline
        textAlignVertical="top"
        placeholderTextColor={muted}
      />

      <Text style={[styles.subTitle, { color: textMain, marginTop: 16 }]}>
        {langUk ? '2) Вікторина' : '2) Quiz'}
      </Text>
      <Text style={[styles.hint, { color: muted, marginBottom: 8 }]}>{st(language, 'adminLmQuizFallbackHint')}</Text>
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmQuizQUk')}</Text>
      <TextInput
        value={story.quiz.questionUk}
        onChangeText={(t) => patch((s) => ({ ...s, quiz: { ...s.quiz, questionUk: t } }))}
        style={inputStyle}
        placeholderTextColor={muted}
      />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmQuizQEn')}</Text>
      <TextInput
        value={story.quiz.questionEn}
        onChangeText={(t) => patch((s) => ({ ...s, quiz: { ...s.quiz, questionEn: t } }))}
        style={inputStyle}
        placeholderTextColor={muted}
      />
      {[0, 1, 2].map((idx) => (
        <View key={idx} style={[styles.optBox, { borderColor: border }]}>
          <Text style={[styles.optLabel, { color: textMain }]}>{st(language, 'adminLmQuizOpt')} {idx + 1}</Text>
          <Text style={[styles.label, { color: muted }]}>UK</Text>
          <TextInput
            value={story.quiz.options[idx].textUk}
            onChangeText={(t) =>
              patch((s) => {
                const options = s.quiz.options.map((o, j) => (j === idx ? { ...o, textUk: t } : o));
                return { ...s, quiz: { ...s.quiz, options } };
              })
            }
            style={inputStyle}
            placeholderTextColor={muted}
          />
          <Text style={[styles.label, { color: muted }]}>EN</Text>
          <TextInput
            value={story.quiz.options[idx].textEn}
            onChangeText={(t) =>
              patch((s) => {
                const options = s.quiz.options.map((o, j) => (j === idx ? { ...o, textEn: t } : o));
                return { ...s, quiz: { ...s.quiz, options } };
              })
            }
            style={inputStyle}
            placeholderTextColor={muted}
          />
          <Pressable
            onPress={() =>
              patch((s) => {
                const options = s.quiz.options.map((o, j) => (j === idx ? { ...o, correct: !o.correct } : o));
                return { ...s, quiz: { ...s.quiz, options } };
              })
            }
            style={({ pressed }) => [
              styles.correctBtn,
              {
                borderColor: story.quiz.options[idx].correct ? accent : border,
                backgroundColor: story.quiz.options[idx].correct ? (isLight ? 'rgba(2,18,235,0.08)' : 'rgba(225,255,0,0.1)') : 'transparent',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            android_ripple={ripple}
          >
            <Text style={[styles.correctBtnTxt, { color: story.quiz.options[idx].correct ? accent : muted }]}>
              {st(language, 'adminLmMarkCorrect')}
            </Text>
          </Pressable>
        </View>
      ))}
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmMultiHintUk')}</Text>
      <TextInput
        value={story.quiz.multiHintUk}
        onChangeText={(t) => patch((s) => ({ ...s, quiz: { ...s.quiz, multiHintUk: t } }))}
        style={inputStyle}
        placeholderTextColor={muted}
      />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmMultiHintEn')}</Text>
      <TextInput
        value={story.quiz.multiHintEn}
        onChangeText={(t) => patch((s) => ({ ...s, quiz: { ...s.quiz, multiHintEn: t } }))}
        style={inputStyle}
        placeholderTextColor={muted}
      />

      <View style={[styles.sectionCard, { borderColor: border, backgroundColor: isLight ? '#FAFBFF' : '#121212' }]}>
        <Text style={[styles.subTitle, { color: textMain, marginTop: 0 }]}>
          {langUk ? '3) Фото + факт (третя сторінка)' : '3) Photo + fact (page 3)'}
        </Text>
        <Text style={[styles.hint, { color: muted, marginBottom: 8 }]}>
          {langUk
            ? 'Фон сторінки факту: вкажіть одне фото та текст факту.'
            : 'Fact page background: set one photo and fact text.'}
        </Text>
        <Text style={[styles.label, { color: muted }]}>{langUk ? 'Фото фону (URL)' : 'Background photo (URL)'}</Text>
        <TextInput
          value={story.photoFact.bgUri}
          onChangeText={(t) => patch((s) => ({ ...s, photoFact: { ...s.photoFact, bgUri: t } }))}
          style={inputStyle}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://…"
          placeholderTextColor={muted}
        />
        <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmFactTitleUk')}</Text>
        <TextInput
          value={story.photoFact.titleUk}
          onChangeText={(t) => patch((s) => ({ ...s, photoFact: { ...s.photoFact, titleUk: t } }))}
          style={inputStyle}
          placeholderTextColor={muted}
        />
        <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmFactTitleEn')}</Text>
        <TextInput
          value={story.photoFact.titleEn}
          onChangeText={(t) => patch((s) => ({ ...s, photoFact: { ...s.photoFact, titleEn: t } }))}
          style={inputStyle}
          placeholderTextColor={muted}
        />
        <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmFactBodyUk')}</Text>
        <TextInput
          value={story.photoFact.bodyUk}
          onChangeText={(t) => patch((s) => ({ ...s, photoFact: { ...s.photoFact, bodyUk: t } }))}
          style={[...inputStyle, styles.tall]}
          multiline
          textAlignVertical="top"
          placeholderTextColor={muted}
        />
        <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmFactBodyEn')}</Text>
        <TextInput
          value={story.photoFact.bodyEn}
          onChangeText={(t) => patch((s) => ({ ...s, photoFact: { ...s.photoFact, bodyEn: t } }))}
          style={[...inputStyle, styles.tall]}
          multiline
          textAlignVertical="top"
          placeholderTextColor={muted}
        />
      </View>

      <View style={[styles.sectionCard, { borderColor: border, backgroundColor: isLight ? '#FAFBFF' : '#121212' }]}>
        <Text style={[styles.subTitle, { color: textMain, marginTop: 0 }]}>
          {langUk ? '4) До / Після (бегунок, четверта сторінка)' : '4) Before / After (slider, page 4)'}
        </Text>
        <Text style={[styles.hint, { color: muted, marginBottom: 8 }]}>
          {langUk
            ? 'Нижнє фото = стара памʼятка. Верхнє фото = нова памʼятка (обрізається лінією).'
            : 'Bottom photo = old landmark. Top photo = new landmark (clipped by slider line).'}
        </Text>
        <Text style={[styles.label, { color: muted }]}>
          {langUk ? 'Нижнє фото (стара памʼятка)' : 'Bottom photo (old landmark)'}
        </Text>
        <TextInput
          value={story.beforeAfter.oldUri}
          onChangeText={(t) => patch((s) => ({ ...s, beforeAfter: { ...s.beforeAfter, oldUri: t } }))}
          style={inputStyle}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://…"
          placeholderTextColor={muted}
        />
        <Text style={[styles.label, { color: muted }]}>
          {langUk ? 'Верхнє фото (нова памʼятка)' : 'Top photo (new landmark)'}
        </Text>
        <TextInput
          value={story.beforeAfter.newUri}
          onChangeText={(t) => patch((s) => ({ ...s, beforeAfter: { ...s.beforeAfter, newUri: t } }))}
          style={inputStyle}
          autoCapitalize="none"
          keyboardType="url"
          placeholder="https://…"
          placeholderTextColor={muted}
        />
      </View>

      <Text style={[styles.subTitle, { color: textMain, marginTop: 16 }]}>
        {langUk ? '5) Додатковий факт (опціонально)' : '5) Additional fact (optional)'}
      </Text>
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmFactTitleUk')}</Text>
      <TextInput
        value={story.secondFact.titleUk}
        onChangeText={(t) => patch((s) => ({ ...s, secondFact: { ...s.secondFact, titleUk: t } }))}
        style={inputStyle}
        placeholderTextColor={muted}
      />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmFactTitleEn')}</Text>
      <TextInput
        value={story.secondFact.titleEn}
        onChangeText={(t) => patch((s) => ({ ...s, secondFact: { ...s.secondFact, titleEn: t } }))}
        style={inputStyle}
        placeholderTextColor={muted}
      />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmFactBodyUk')}</Text>
      <TextInput
        value={story.secondFact.bodyUk}
        onChangeText={(t) => patch((s) => ({ ...s, secondFact: { ...s.secondFact, bodyUk: t } }))}
        style={[...inputStyle, styles.tall]}
        multiline
        textAlignVertical="top"
        placeholderTextColor={muted}
      />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmFactBodyEn')}</Text>
      <TextInput
        value={story.secondFact.bodyEn}
        onChangeText={(t) => patch((s) => ({ ...s, secondFact: { ...s.secondFact, bodyEn: t } }))}
        style={[...inputStyle, styles.tall]}
        multiline
        textAlignVertical="top"
        placeholderTextColor={muted}
      />

      <Text style={[styles.subTitle, { color: textMain, marginTop: 16 }]}>{st(language, 'adminLmClosing')}</Text>
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmClosingUk')}</Text>
      <TextInput
        value={story.closingUk}
        onChangeText={(t) => patch((s) => ({ ...s, closingUk: t }))}
        style={[...inputStyle, styles.tall]}
        multiline
        textAlignVertical="top"
        placeholderTextColor={muted}
      />
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmClosingEn')}</Text>
      <TextInput
        value={story.closingEn}
        onChangeText={(t) => patch((s) => ({ ...s, closingEn: t }))}
        style={[...inputStyle, styles.tall]}
        multiline
        textAlignVertical="top"
        placeholderTextColor={muted}
      />

      <Text style={[styles.subTitle, { color: textMain, marginTop: 16 }]}>{st(language, 'adminLmAudio')}</Text>
      <Text style={[styles.label, { color: muted }]}>{st(language, 'adminLmAudioUri')}</Text>
      <TextInput
        value={story.audioUri}
        onChangeText={(t) => patch((s) => ({ ...s, audioUri: t }))}
        style={inputStyle}
        autoCapitalize="none"
        keyboardType="url"
        placeholder="https://… .mp3"
        placeholderTextColor={muted}
      />
      <View style={[styles.rowSwitch, { borderColor: border }]}>
        <Text style={[styles.switchLabel, { color: textMain }]}>{st(language, 'adminLmTtsFlag')}</Text>
        <Switch
          value={!!story.ttsEnabled}
          onValueChange={(v) => patch((s) => ({ ...s, ttsEnabled: v }))}
          trackColor={{ false: border, true: isLight ? 'rgba(2,18,235,0.35)' : '#5a6a00' }}
          thumbColor={isLight ? accent : muted}
          ios_backgroundColor={border}
        />
      </View>
      <Text style={[styles.hint, { color: muted, marginTop: 6 }]}>{st(language, 'adminLmTtsNote')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6, marginBottom: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  subTitle: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  hint: { fontSize: 12, lineHeight: 17, marginBottom: 12 },
  label: { fontSize: 13, marginBottom: 4, marginTop: 6 },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
  },
  tall: { minHeight: 72, paddingTop: Platform.OS === 'ios' ? 10 : 8 },
  optBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  optLabel: { fontWeight: '700', marginBottom: 6, fontSize: 14 },
  sectionCard: {
    marginTop: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
  },
  correctBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  correctBtnTxt: { fontWeight: '700', fontSize: 13 },
  rowSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  switchLabel: { flex: 1, fontSize: 14, fontWeight: '600', paddingRight: 12 },
});

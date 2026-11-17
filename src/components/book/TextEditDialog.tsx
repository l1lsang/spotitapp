import { useState } from 'react'
import { View } from 'react-native'
import { Text, TextInput } from '../Typography'
import { Dialog } from '../Dialog'
import { Button, p, s } from '../ui'
import { MAX_TEXT_LENGTH } from '../../lib/book/editor'

/** Writing or rewriting one text box. Saving an empty box removes it. */
export function TextEditDialog({ initialText, title, onClose, onSave }: {
  initialText: string
  title: string
  onClose: () => void
  onSave: (text: string) => void
}) {
  const [text, setText] = useState(initialText)
  return <Dialog visible title={title} onClose={onClose}>
    <TextInput
      autoFocus multiline value={text} onChangeText={setText} maxLength={MAX_TEXT_LENGTH}
      accessibilityLabel="페이지에 넣을 글" placeholder="이 페이지에 남길 글을 적어 주세요" placeholderTextColor={p.light}
      style={[s.input, { minHeight: 140, textAlignVertical: 'top', lineHeight: 24 }]}
    />
    <Text style={{ alignSelf: 'flex-end', fontSize: 13, color: p.muted }}>{text.length} / {MAX_TEXT_LENGTH}</Text>
    <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
      <Button variant="secondary" title="취소" onPress={onClose} />
      <Button title={initialText && !text.trim() ? '글 상자 지우기' : '완료'} onPress={() => onSave(text)} />
    </View>
  </Dialog>
}

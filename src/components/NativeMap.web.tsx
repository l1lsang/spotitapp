import { ScrollView, Text, View } from "react-native";
import type { NativeMapProps } from "./NativeMap";
import { Empty, p, Row, s } from "./ui";
export default function NativeMap({ center, posts, onSelect }: NativeMapProps) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: p.surface }}
      contentContainerStyle={{ padding: 24, paddingTop: 140 }}
    >
      <Empty
        title="장소 지도"
        description="대화형 지도는 iOS·Android 앱에서 사용할 수 있습니다."
      />
      <Text style={[s.muted, { textAlign: "center" }]}>
        중심 {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
      </Text>
      {posts.map((post) => (
        <Row
          key={post.id}
          title={post.title}
          subtitle={post.placeName}
          onPress={() => onSelect([post])}
        />
      ))}
      <View style={{ height: 160 }} />
    </ScrollView>
  );
}

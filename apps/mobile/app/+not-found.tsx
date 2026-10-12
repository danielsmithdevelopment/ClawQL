import { Link, Stack } from "expo-router";

import { brand, color, space } from "@/src/theme";
import { Body, Column, Fill, Meta, ScreenHost, Title } from "@/src/ui/primitives";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <ScreenHost testID="not-found-screen">
        <Fill style={{ justifyContent: "center", padding: space.lg }}>
          <Column spacing={space.md} alignment="center">
            <Title>This screen does not exist</Title>
            <Body color={brand.inkMuted}>The link may be stale or mistyped.</Body>
            <Link href="/" testID="not-found-home">
              <Meta color={color.primary}>Go to home</Meta>
            </Link>
          </Column>
        </Fill>
      </ScreenHost>
    </>
  );
}

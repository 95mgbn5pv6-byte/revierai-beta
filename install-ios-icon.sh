#!/bin/bash
set -e

SOURCE="$CM_BUILD_DIR/resources/icon-1024.png"
DEST="$CM_BUILD_DIR/ios/App/App/Assets.xcassets/AppIcon.appiconset"

mkdir -p "$DEST"

make_icon () {
  SIZE="$1"
  SCALE="$2"
  FILENAME="$3"
  PIXELS=$(python3 - <<PY
print(int(float("$SIZE") * int("$SCALE")))
PY
)
  sips -z "$PIXELS" "$PIXELS" "$SOURCE" --out "$DEST/$FILENAME" >/dev/null
}

make_icon 20 2 "Icon-App-20x20@2x.png"
make_icon 20 3 "Icon-App-20x20@3x.png"
make_icon 29 2 "Icon-App-29x29@2x.png"
make_icon 29 3 "Icon-App-29x29@3x.png"
make_icon 40 2 "Icon-App-40x40@2x.png"
make_icon 40 3 "Icon-App-40x40@3x.png"
make_icon 60 2 "Icon-App-60x60@2x.png"
make_icon 60 3 "Icon-App-60x60@3x.png"
make_icon 20 1 "Icon-App-20x20@1x.png"
make_icon 29 1 "Icon-App-29x29@1x.png"
make_icon 40 1 "Icon-App-40x40@1x.png"
make_icon 76 1 "Icon-App-76x76@1x.png"
make_icon 76 2 "Icon-App-76x76@2x.png"
make_icon 83.5 2 "Icon-App-83.5x83.5@2x.png"
cp "$SOURCE" "$DEST/Icon-App-1024x1024@1x.png"

cat > "$DEST/Contents.json" <<'JSON'
{
  "images" : [
    {"filename":"Icon-App-20x20@2x.png","idiom":"iphone","scale":"2x","size":"20x20"},
    {"filename":"Icon-App-20x20@3x.png","idiom":"iphone","scale":"3x","size":"20x20"},
    {"filename":"Icon-App-29x29@2x.png","idiom":"iphone","scale":"2x","size":"29x29"},
    {"filename":"Icon-App-29x29@3x.png","idiom":"iphone","scale":"3x","size":"29x29"},
    {"filename":"Icon-App-40x40@2x.png","idiom":"iphone","scale":"2x","size":"40x40"},
    {"filename":"Icon-App-40x40@3x.png","idiom":"iphone","scale":"3x","size":"40x40"},
    {"filename":"Icon-App-60x60@2x.png","idiom":"iphone","scale":"2x","size":"60x60"},
    {"filename":"Icon-App-60x60@3x.png","idiom":"iphone","scale":"3x","size":"60x60"},
    {"filename":"Icon-App-20x20@1x.png","idiom":"ipad","scale":"1x","size":"20x20"},
    {"filename":"Icon-App-20x20@2x.png","idiom":"ipad","scale":"2x","size":"20x20"},
    {"filename":"Icon-App-29x29@1x.png","idiom":"ipad","scale":"1x","size":"29x29"},
    {"filename":"Icon-App-29x29@2x.png","idiom":"ipad","scale":"2x","size":"29x29"},
    {"filename":"Icon-App-40x40@1x.png","idiom":"ipad","scale":"1x","size":"40x40"},
    {"filename":"Icon-App-40x40@2x.png","idiom":"ipad","scale":"2x","size":"40x40"},
    {"filename":"Icon-App-76x76@1x.png","idiom":"ipad","scale":"1x","size":"76x76"},
    {"filename":"Icon-App-76x76@2x.png","idiom":"ipad","scale":"2x","size":"76x76"},
    {"filename":"Icon-App-83.5x83.5@2x.png","idiom":"ipad","scale":"2x","size":"83.5x83.5"},
    {"filename":"Icon-App-1024x1024@1x.png","idiom":"ios-marketing","scale":"1x","size":"1024x1024"}
  ],
  "info" : {"author":"xcode","version":1}
}
JSON

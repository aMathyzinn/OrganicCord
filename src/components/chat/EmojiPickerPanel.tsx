import type { ReactNode } from "react";
import EmojiPicker, {
  Categories,
  Theme,
  type Props as EmojiPickerProps,
} from "emoji-picker-react";

type Props = Omit<EmojiPickerProps, "theme" | "categoryIcons"> & {
  customCategoryIcon?: ReactNode;
};

export function EmojiPickerPanel({ customCategoryIcon, ...props }: Props) {
  return (
    <EmojiPicker
      {...props}
      theme={Theme.DARK}
      categoryIcons={
        customCategoryIcon
          ? { [Categories.CUSTOM]: customCategoryIcon }
          : undefined
      }
    />
  );
}

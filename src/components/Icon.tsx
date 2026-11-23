type IconName =
  | "home"
  | "compass"
  | "bell"
  | "user"
  | "plus"
  | "back"
  | "check"
  | "users"
  | "calendar"
  | "settings"
  | "search"
  | "pin"
  | "heart"
  | "message"
  | "lock"
  | "shield"
  | "sparkle"
  | "upload"
  | "right"
  | "logout"
  | "close"
  | "edit"
  | "trash"
  | "eye"
  | "mail"
  | "map"
  | "flag"
  | "share"
  | "link"
  | "image"
  | "more";

const PATHS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5.5-5.5 2 2-5.5 5.5-2Z",
  bell: "M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7M13.7 20a2 2 0 0 1-3.4 0",
  user: "M20 21a8 8 0 1 0-16 0M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  plus: "M12 5v14M5 12h14",
  back: "M19 12H5m0 0 6-6m-6 6 6 6",
  check: "m4 12 5 5L20 6",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  calendar: "M7 3v3m10-3v3M3.5 9h17M5 5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 5 5Z",
  settings:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5c0-.6-.1-1.2-.2-1.8l2-1.3-2-3.4-2.1.9a7.6 7.6 0 0 0-3.1-1.8L14.2 2h-4l-.4 2.6a7.6 7.6 0 0 0-3.1 1.8l-2.1-.9-2 3.4 2 1.3a8 8 0 0 0 0 3.6l-2 1.3 2 3.4 2.1-.9a7.6 7.6 0 0 0 3.1 1.8l.4 2.6h4l.4-2.6a7.6 7.6 0 0 0 3.1-1.8l2.1.9 2-3.4-2-1.3c.1-.6.2-1.2.2-1.8Z",
  search: "M21 21l-4.3-4.3M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z",
  pin: "m12 17 5.3-5.3a4.5 4.5 0 0 0-6.4-6.4L5.6 10.6a1 1 0 0 0 0 1.4l.6.6a1 1 0 0 0 1.4 0l4.2-4.2M12 17l-4.2 4.2",
  heart: "M12 20s-7.5-4.6-7.5-9.4A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 3C19.5 15.4 12 20 12 20Z",
  message: "M21 12a8 8 0 0 1-8 8H7l-4 3 1.2-4.4A8 8 0 1 1 21 12Z",
  lock: "M6 10V7a6 6 0 0 1 12 0v3M5 10h14v11H5V10Z",
  shield: "M12 21c4.5-2 7-5.2 7-9V5.5L12 3 5 5.5V12c0 3.8 2.5 7 7 9Zm-2.5-9 2 2 3.5-4",
  sparkle: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z",
  upload: "M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17",
  right: "m9 6 6 6-6 6",
  logout: "M15 17l5-5-5-5M20 12H9M12 3H5.5A1.5 1.5 0 0 0 4 4.5v15A1.5 1.5 0 0 0 5.5 21H12",
  close: "M6 6l12 12M18 6 6 18",
  edit: "M4 20h4L20 8l-4-4L4 16v4Zm10-14 4 4",
  trash: "M4 7h16M9 7V4h6v3m-8 0 1 14h8l1-14",
  eye: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Zm10 2.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z",
  mail: "M3 6.5h18v11H3v-11Zm0 .5 9 6.5 9-6.5",
  map: "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  flag: "M5 21V4m0 0h11l-1.5 4L16 12H5",
  share: "M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 10.5l6.8-4M8.6 13.5l6.8 4",
  link: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7",
  image: "M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 4 5.5Zm2.6 9.5 3.4-4 2.9 3.2 2.3-2.4 3 4.2M8.4 9.6h.01",
  more: "M6 12h.01M12 12h.01M18 12h.01",
};

export function Icon({
  name,
  size = 20,
  className = "",
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type { IconName };

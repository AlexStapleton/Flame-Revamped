export const isUrlOrIp = (data: string): boolean => {
  const regex =
    /^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?|^((http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$/i;

  return regex.test(data);
};

export const isUrl = (data: string): boolean => {
  // Any explicit http(s) URL counts, including single-label LAN hosts such as
  // http://nas/icon.png or http://localhost:8080/icon.svg, which the pattern
  // below misses because it requires a dot in the hostname. Without this,
  // such icons were treated as upload filenames and requested from /uploads.
  if (/^https?:\/\/[^\s/?#]+/i.test(data)) return true;

  const regex =
    /(https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|www\.[a-zA-Z0-9][a-zA-Z0-9-]+[a-zA-Z0-9]\.[^\s]{2,}|https?:\/\/(?:www\.|(?!www))[a-zA-Z0-9]+\.[^\s]{2,}|www\.[a-zA-Z0-9]+\.[^\s]{2,})/i;

  return regex.test(data);
};

export const isImage = (data: string): boolean => {
  const regex = /.(jpeg|jpg|png|ico)$/i;

  return regex.test(data);
};

export const isSvg = (data: string): boolean => {
  const regex = /.(svg)$/i;

  return regex.test(data);
};

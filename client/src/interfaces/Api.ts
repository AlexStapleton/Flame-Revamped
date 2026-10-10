export interface Model {
  id: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

// MDI icon name -> SVG path, sent by GET /api/apps and GET /api/categories.
export type IconPaths = Record<string, string>;

export interface Token {
  app: string;
  exp: number;
  iat: number;
}

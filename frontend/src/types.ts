export type Coordinates = {
  lat: number;
  lng: number;
};

export type Spot = {
  id: number;
  owner: string;
  is_owner: boolean;
  description: string;
  location: Coordinates;
  created_at: string;
  updated_at: string;
};

export type AuthUser = {
  is_authenticated: boolean;
  username: string | null;
};

export type DraftSpot =
  | {
      mode: "create";
      location: Coordinates;
      description: string;
    }
  | {
      mode: "edit";
      spotId: number;
      location: Coordinates;
      description: string;
    };

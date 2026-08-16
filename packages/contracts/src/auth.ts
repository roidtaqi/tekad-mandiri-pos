export interface AuthContextResponse {
  user: {
    id: string;
    display_name: string;
  };
  membership: {
    business_id: string;
    status: "ACTIVE";
  };
  primary_role: string;
  permissions: readonly string[];
  authorization_version: number;
  offline_valid_until: string;
  default_location_id: string;
  server_time: string;
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      clinics: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      joint_results: {
        Row: {
          confidence_score: number
          id: string
          is_inflamed: boolean
          joint_name: string
          screening_id: string
          side: string
        }
        Insert: {
          confidence_score?: number
          id?: string
          is_inflamed?: boolean
          joint_name: string
          screening_id: string
          side: string
        }
        Update: {
          confidence_score?: number
          id?: string
          is_inflamed?: boolean
          joint_name?: string
          screening_id?: string
          side?: string
        }
        Relationships: [
          {
            foreignKeyName: "joint_results_screening_id_fkey"
            columns: ["screening_id"]
            isOneToOne: false
            referencedRelation: "screenings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          clinic_id: string | null
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          is_active: boolean
          role: string
        }
        Insert: {
          clinic_id?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name: string
          id: string
          is_active?: boolean
          role: string
        }
        Update: {
          clinic_id?: string | null
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_analysis_debug_responses: {
        Row: {
          created_at: string
          raw_response: Json
          screening_id: string
        }
        Insert: {
          created_at?: string
          raw_response: Json
          screening_id: string
        }
        Update: {
          created_at?: string
          raw_response?: Json
          screening_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "screening_analysis_debug_responses_screening_id_fkey"
            columns: ["screening_id"]
            isOneToOne: true
            referencedRelation: "screenings"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_analysis_runs: {
        Row: {
          ai_hands: Json | null
          ai_model_version: string | null
          analysis_error_at: string | null
          analysis_error_code: string | null
          analysis_error_http_status: number | null
          analysis_thr_node: number | null
          analysis_thr_wrist: number | null
          created_at: string
          executed_by: string | null
          executor_name: string | null
          finished_at: string | null
          id: string
          joint_results: Json
          kind: string
          left_image_url: string | null
          ra_detected: boolean | null
          raw_response: Json | null
          right_image_url: string | null
          run_number: number
          screening_id: string
          source: string | null
          started_at: string | null
          status: string
          total_inflamed_joints: number | null
        }
        Insert: {
          ai_hands?: Json | null
          ai_model_version?: string | null
          analysis_error_at?: string | null
          analysis_error_code?: string | null
          analysis_error_http_status?: number | null
          analysis_thr_node?: number | null
          analysis_thr_wrist?: number | null
          created_at?: string
          executed_by?: string | null
          executor_name?: string | null
          finished_at?: string | null
          id: string
          joint_results?: Json
          kind: string
          left_image_url?: string | null
          ra_detected?: boolean | null
          raw_response?: Json | null
          right_image_url?: string | null
          run_number: number
          screening_id: string
          source?: string | null
          started_at?: string | null
          status: string
          total_inflamed_joints?: number | null
        }
        Update: {
          ai_hands?: Json | null
          ai_model_version?: string | null
          analysis_error_at?: string | null
          analysis_error_code?: string | null
          analysis_error_http_status?: number | null
          analysis_thr_node?: number | null
          analysis_thr_wrist?: number | null
          created_at?: string
          executed_by?: string | null
          executor_name?: string | null
          finished_at?: string | null
          id?: string
          joint_results?: Json
          kind?: string
          left_image_url?: string | null
          ra_detected?: boolean | null
          raw_response?: Json | null
          right_image_url?: string | null
          run_number?: number
          screening_id?: string
          source?: string | null
          started_at?: string | null
          status?: string
          total_inflamed_joints?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "screening_analysis_runs_executed_by_fkey"
            columns: ["executed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screening_analysis_runs_screening_id_fkey"
            columns: ["screening_id"]
            isOneToOne: false
            referencedRelation: "screenings"
            referencedColumns: ["id"]
          },
        ]
      }
      screening_threshold_settings: {
        Row: {
          id: boolean
          thr_node: number
          thr_wrist: number
        }
        Insert: {
          id?: boolean
          thr_node: number
          thr_wrist: number
        }
        Update: {
          id?: boolean
          thr_node?: number
          thr_wrist?: number
        }
        Relationships: []
      }
      screenings: {
        Row: {
          screening_clinic_id: string | null
          ai_hands: Json | null
          ai_model_version: string | null
          analysis_error_at: string | null
          analysis_error_code: string | null
          analysis_error_http_status: number | null
          analysis_thr_node: number | null
          analysis_thr_wrist: number | null
          analyzed_at: string | null
          created_at: string
          created_by: string | null
          current_analysis_run_id: string | null
          id: string
          left_image_url: string | null
          ra_detected: boolean | null
          right_image_url: string | null
          status: string
          status_updated_at: string
          subject_id: string | null
          total_inflamed_joints: number | null
        }
        Insert: {
          ai_hands?: Json | null
          ai_model_version?: string | null
          analysis_error_at?: string | null
          analysis_error_code?: string | null
          analysis_error_http_status?: number | null
          analysis_thr_node?: number | null
          analysis_thr_wrist?: number | null
          analyzed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_analysis_run_id?: string | null
          id?: string
          left_image_url?: string | null
          ra_detected?: boolean | null
          right_image_url?: string | null
          status?: string
          status_updated_at?: string
          subject_id?: string | null
          total_inflamed_joints?: number | null
        }
        Update: {
          ai_hands?: Json | null
          ai_model_version?: string | null
          analysis_error_at?: string | null
          analysis_error_code?: string | null
          analysis_error_http_status?: number | null
          analysis_thr_node?: number | null
          analysis_thr_wrist?: number | null
          analyzed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_analysis_run_id?: string | null
          id?: string
          left_image_url?: string | null
          ra_detected?: boolean | null
          right_image_url?: string | null
          status?: string
          status_updated_at?: string
          subject_id?: string | null
          total_inflamed_joints?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "screenings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenings_current_analysis_run_id_fkey"
            columns: ["current_analysis_run_id"]
            isOneToOne: false
            referencedRelation: "screening_analysis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "screenings_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_screening_analysis_run: {
        Args: {
          p_actor_id: string
          p_expected_run_id: string | null
          p_kind: string
          p_run_id: string
          p_screening_id: string
          p_source: string
        }
        Returns: {
          ai_hands: Json | null
          ai_model_version: string | null
          analysis_error_at: string | null
          analysis_error_code: string | null
          analysis_error_http_status: number | null
          analysis_thr_node: number | null
          analysis_thr_wrist: number | null
          created_at: string
          executed_by: string | null
          executor_name: string | null
          finished_at: string | null
          id: string
          joint_results: Json
          kind: string
          left_image_url: string | null
          ra_detected: boolean | null
          raw_response: Json | null
          right_image_url: string | null
          run_number: number
          screening_id: string
          source: string | null
          started_at: string | null
          status: string
          total_inflamed_joints: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "screening_analysis_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_ra_screening_analysis: {
        Args: {
          p_hands: Json
          p_ra_detected: boolean
          p_screening_id: string
          p_total_positive_joints: number
        }
        Returns: undefined
      }
      complete_ra_screening_analysis_with_metadata: {
        Args: {
          p_ai_model_version: string
          p_hands: Json
          p_ra_detected: boolean
          p_raw_response: Json
          p_screening_id: string
          p_total_positive_joints: number
        }
        Returns: undefined
      }
      complete_screening_analysis_run: {
        Args: {
          p_ai_model_version: string
          p_hands: Json
          p_ra_detected: boolean
          p_raw_response: Json
          p_run_id: string
          p_screening_id: string
          p_total_positive_joints: number
        }
        Returns: boolean
      }
      complete_screening_analysis_with_thresholds: {
        Args: {
          p_ai_model_version: string
          p_hands: Json
          p_ra_detected: boolean
          p_raw_response: Json
          p_screening_id: string
          p_thr_node: number
          p_thr_wrist: number
          p_total_positive_joints: number
        }
        Returns: undefined
      }
      correct_screening_subject: {
        Args: {
          p_changed_by: string
          p_expected_subject_id: string | null
          p_new_subject_id: string | null
          p_screening_id: string
        }
        Returns: undefined
      }
      fail_screening_analysis_run: {
        Args: {
          p_error_code: string
          p_http_status: number | null
          p_run_id: string
          p_screening_id: string
        }
        Returns: boolean
      }
      get_user_clinic_id: { Args: never; Returns: string }
      is_active_user: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      ra_api_joint_name: { Args: { p_api_joint_name: string }; Returns: string }
      recover_interrupted_screening: {
        Args: {
          p_actor_id: string
          p_expected_updated_at: string
          p_screening_id: string
        }
        Returns: boolean
      }
      screening_clinic_id: {
        Args: { p_screening: Database["public"]["Tables"]["screenings"]["Row"] }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

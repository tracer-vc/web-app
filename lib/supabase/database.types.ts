// Generated from the live schema (Supabase generate_typescript_types).
// Do not edit by hand; regenerate after every migration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      collection_prompts: {
        Row: {
          config_id: string
          created_at: string
          fund_id: string
          id: string
          position: number
          question: string
          required: boolean
        }
        Insert: {
          config_id: string
          created_at?: string
          fund_id: string
          id?: string
          position: number
          question: string
          required?: boolean
        }
        Update: {
          config_id?: string
          created_at?: string
          fund_id?: string
          id?: string
          position?: number
          question?: string
          required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "collection_prompts_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "framework_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_prompts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      counter_case_prompts: {
        Row: {
          config_id: string
          created_at: string
          fund_id: string
          id: string
          position: number
          prompt: string
        }
        Insert: {
          config_id: string
          created_at?: string
          fund_id: string
          id?: string
          position: number
          prompt: string
        }
        Update: {
          config_id?: string
          created_at?: string
          fund_id?: string
          id?: string
          position?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_case_prompts_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "framework_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counter_case_prompts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      dimension_prompts: {
        Row: {
          created_at: string
          dimension_id: string
          fund_id: string
          id: string
          position: number
          prompt: string
        }
        Insert: {
          created_at?: string
          dimension_id: string
          fund_id: string
          id?: string
          position: number
          prompt: string
        }
        Update: {
          created_at?: string
          dimension_id?: string
          fund_id?: string
          id?: string
          position?: number
          prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "dimension_prompts_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_prompts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      dimension_required_prompts: {
        Row: {
          created_at: string
          dimension_id: string
          fund_id: string
          prompt_id: string
        }
        Insert: {
          created_at?: string
          dimension_id: string
          fund_id: string
          prompt_id: string
        }
        Update: {
          created_at?: string
          dimension_id?: string
          fund_id?: string
          prompt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dimension_required_prompts_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_required_prompts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_required_prompts_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "collection_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      dimensions: {
        Row: {
          claim_coverage: string
          config_id: string
          created_at: string
          disqualifying_below: number | null
          fund_id: string
          high_score_signals: string
          id: string
          low_score_signals: string
          position: number
          question: string
          title: string
        }
        Insert: {
          claim_coverage?: string
          config_id: string
          created_at?: string
          disqualifying_below?: number | null
          fund_id: string
          high_score_signals?: string
          id?: string
          low_score_signals?: string
          position: number
          question: string
          title: string
        }
        Update: {
          claim_coverage?: string
          config_id?: string
          created_at?: string
          disqualifying_below?: number | null
          fund_id?: string
          high_score_signals?: string
          id?: string
          low_score_signals?: string
          position?: number
          question?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "dimensions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "framework_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimensions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      framework_configs: {
        Row: {
          classification_criteria: Json
          confidence_rules: Json
          created_at: string
          created_by: string | null
          fund_id: string
          id: string
          is_active: boolean
          published_at: string | null
          score_anchors: Json
          status: Database["public"]["Enums"]["config_status"]
          sufficiency_rule: Json
          tier_definitions: Json
          version: number
        }
        Insert: {
          classification_criteria: Json
          confidence_rules: Json
          created_at?: string
          created_by?: string | null
          fund_id?: string
          id?: string
          is_active?: boolean
          published_at?: string | null
          score_anchors: Json
          status?: Database["public"]["Enums"]["config_status"]
          sufficiency_rule: Json
          tier_definitions: Json
          version: number
        }
        Update: {
          classification_criteria?: Json
          confidence_rules?: Json
          created_at?: string
          created_by?: string | null
          fund_id?: string
          id?: string
          is_active?: boolean
          published_at?: string | null
          score_anchors?: Json
          status?: Database["public"]["Enums"]["config_status"]
          sufficiency_rule?: Json
          tier_definitions?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "framework_configs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "framework_configs_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      funds: {
        Row: {
          created_at: string
          id: string
          llm_model: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          llm_model?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          llm_model?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          fund_id: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          fund_id: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          display_name?: string | null
          fund_id?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "profiles_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_screen_questions: {
        Row: {
          config_id: string
          created_at: string
          fund_id: string
          id: string
          label: string
          position: number
          question: string
        }
        Insert: {
          config_id: string
          created_at?: string
          fund_id: string
          id?: string
          label: string
          position: number
          question: string
        }
        Update: {
          config_id?: string
          created_at?: string
          fund_id?: string
          id?: string
          label?: string
          position?: number
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_screen_questions_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "framework_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_screen_questions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_fund_with_admin: {
        Args: { p_display_name: string; p_fund_name: string; p_user_id: string }
        Returns: string
      }
    }
    Enums: {
      config_status: "draft" | "published"
      source_tier: "primary" | "secondary" | "tertiary"
      user_role: "analyst" | "admin"
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
    Enums: {
      config_status: ["draft", "published"],
      source_tier: ["primary", "secondary", "tertiary"],
      user_role: ["analyst", "admin"],
    },
  },
} as const

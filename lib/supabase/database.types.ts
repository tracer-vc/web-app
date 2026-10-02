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
      analyst_actions: {
        Row: {
          action: string
          actor_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          fund_id: string
          id: string
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          fund_id?: string
          id?: string
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          fund_id?: string
          id?: string
          target_id?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "analyst_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analyst_actions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_prompt_coverage: {
        Row: {
          claim_id: string
          created_at: string
          fund_id: string
          prompt_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          fund_id: string
          prompt_id: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          fund_id?: string
          prompt_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_prompt_coverage_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_prompt_coverage_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_prompt_coverage_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "collection_prompts"
            referencedColumns: ["id"]
          },
        ]
      }
      claim_sources: {
        Row: {
          claim_id: string
          created_at: string
          excerpt: string
          excerpt_end: number
          excerpt_start: number
          fund_id: string
          id: string
          marked_wrong_at: string | null
          marked_wrong_by: string | null
          source_id: string
        }
        Insert: {
          claim_id: string
          created_at?: string
          excerpt: string
          excerpt_end: number
          excerpt_start: number
          fund_id: string
          id?: string
          marked_wrong_at?: string | null
          marked_wrong_by?: string | null
          source_id: string
        }
        Update: {
          claim_id?: string
          created_at?: string
          excerpt?: string
          excerpt_end?: number
          excerpt_start?: number
          fund_id?: string
          id?: string
          marked_wrong_at?: string | null
          marked_wrong_by?: string | null
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_sources_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_sources_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_sources_marked_wrong_by_fkey"
            columns: ["marked_wrong_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claim_sources_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      claims: {
        Row: {
          code: string
          confidence: Database["public"]["Enums"]["claim_confidence"] | null
          confidence_basis: Json | null
          created_at: string
          evaluation_id: string
          fund_id: string
          id: string
          merged_into: string | null
          notes: string | null
          run_id: string | null
          statement: string
          type: Database["public"]["Enums"]["claim_type"]
        }
        Insert: {
          code: string
          confidence?: Database["public"]["Enums"]["claim_confidence"] | null
          confidence_basis?: Json | null
          created_at?: string
          evaluation_id: string
          fund_id: string
          id?: string
          merged_into?: string | null
          notes?: string | null
          run_id?: string | null
          statement: string
          type: Database["public"]["Enums"]["claim_type"]
        }
        Update: {
          code?: string
          confidence?: Database["public"]["Enums"]["claim_confidence"] | null
          confidence_basis?: Json | null
          created_at?: string
          evaluation_id?: string
          fund_id?: string
          id?: string
          merged_into?: string | null
          notes?: string | null
          run_id?: string | null
          statement?: string
          type?: Database["public"]["Enums"]["claim_type"]
        }
        Relationships: [
          {
            foreignKeyName: "claims_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
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
      companies: {
        Row: {
          created_at: string
          fund_id: string
          id: string
          name: string
          sector: string
          stage: string
          website: string
        }
        Insert: {
          created_at?: string
          fund_id?: string
          id?: string
          name: string
          sector?: string
          stage?: string
          website?: string
        }
        Update: {
          created_at?: string
          fund_id?: string
          id?: string
          name?: string
          sector?: string
          stage?: string
          website?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      conflicts: {
        Row: {
          code: string
          created_at: string
          description: string
          evaluation_id: string
          fund_id: string
          id: string
          kind: Database["public"]["Enums"]["conflict_kind"]
          parent_conflict_id: string | null
          passage_a: string
          passage_b: string
          rationale: string | null
          resolved_at: string | null
          resolved_by: string | null
          run_id: string | null
          side_a_id: string
          side_b_id: string
          status: Database["public"]["Enums"]["conflict_status"]
        }
        Insert: {
          code: string
          created_at?: string
          description: string
          evaluation_id: string
          fund_id: string
          id?: string
          kind: Database["public"]["Enums"]["conflict_kind"]
          parent_conflict_id?: string | null
          passage_a: string
          passage_b: string
          rationale?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          side_a_id: string
          side_b_id: string
          status?: Database["public"]["Enums"]["conflict_status"]
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          evaluation_id?: string
          fund_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["conflict_kind"]
          parent_conflict_id?: string | null
          passage_a?: string
          passage_b?: string
          rationale?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          run_id?: string | null
          side_a_id?: string
          side_b_id?: string
          status?: Database["public"]["Enums"]["conflict_status"]
        }
        Relationships: [
          {
            foreignKeyName: "conflicts_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflicts_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflicts_parent_conflict_id_fkey"
            columns: ["parent_conflict_id"]
            isOneToOne: false
            referencedRelation: "conflicts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflicts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      counter_argument_claims: {
        Row: {
          argument_id: string
          claim_id: string
          fund_id: string
        }
        Insert: {
          argument_id: string
          claim_id: string
          fund_id: string
        }
        Update: {
          argument_id?: string
          claim_id?: string
          fund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counter_argument_claims_argument_id_fkey"
            columns: ["argument_id"]
            isOneToOne: false
            referencedRelation: "counter_arguments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counter_argument_claims_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counter_argument_claims_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      counter_arguments: {
        Row: {
          argument: string
          counter_case_prompt_id: string | null
          created_at: string
          evaluation_id: string
          fund_id: string
          id: string
          mechanism: string
          rank: number
          run_id: string | null
        }
        Insert: {
          argument: string
          counter_case_prompt_id?: string | null
          created_at?: string
          evaluation_id: string
          fund_id: string
          id?: string
          mechanism: string
          rank: number
          run_id?: string | null
        }
        Update: {
          argument?: string
          counter_case_prompt_id?: string | null
          created_at?: string
          evaluation_id?: string
          fund_id?: string
          id?: string
          mechanism?: string
          rank?: number
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "counter_arguments_counter_case_prompt_id_fkey"
            columns: ["counter_case_prompt_id"]
            isOneToOne: false
            referencedRelation: "counter_case_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counter_arguments_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counter_arguments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counter_arguments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
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
      decisions: {
        Row: {
          classification: Database["public"]["Enums"]["verdict"]
          created_at: string
          evaluation_id: string
          fund_id: string
          id: string
          reeval_trigger: string | null
          rule_trace: Json
          run_id: string | null
        }
        Insert: {
          classification: Database["public"]["Enums"]["verdict"]
          created_at?: string
          evaluation_id: string
          fund_id: string
          id?: string
          reeval_trigger?: string | null
          rule_trace: Json
          run_id?: string | null
        }
        Update: {
          classification?: Database["public"]["Enums"]["verdict"]
          created_at?: string
          evaluation_id?: string
          fund_id?: string
          id?: string
          reeval_trigger?: string | null
          rule_trace?: Json
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "decisions_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "decisions_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dimension_assessment_claims: {
        Row: {
          assessment_id: string
          claim_id: string
          fund_id: string
        }
        Insert: {
          assessment_id: string
          claim_id: string
          fund_id: string
        }
        Update: {
          assessment_id?: string
          claim_id?: string
          fund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dimension_assessment_claims_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "dimension_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_assessment_claims_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_assessment_claims_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      dimension_assessments: {
        Row: {
          answers: Json
          code: string
          counter_signal: string
          created_at: string
          dimension_id: string
          evaluation_id: string
          fund_id: string
          id: string
          override_at: string | null
          override_by: string | null
          override_reason: string | null
          override_score: number | null
          proposed_score: number
          run_id: string | null
          score: number
          score_capped_by: string | null
        }
        Insert: {
          answers: Json
          code: string
          counter_signal: string
          created_at?: string
          dimension_id: string
          evaluation_id: string
          fund_id: string
          id?: string
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          override_score?: number | null
          proposed_score: number
          run_id?: string | null
          score: number
          score_capped_by?: string | null
        }
        Update: {
          answers?: Json
          code?: string
          counter_signal?: string
          created_at?: string
          dimension_id?: string
          evaluation_id?: string
          fund_id?: string
          id?: string
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          override_score?: number | null
          proposed_score?: number
          run_id?: string | null
          score?: number
          score_capped_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dimension_assessments_dimension_id_fkey"
            columns: ["dimension_id"]
            isOneToOne: false
            referencedRelation: "dimensions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_assessments_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_assessments_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_assessments_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_assessments_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dimension_assessments_score_capped_by_fkey"
            columns: ["score_capped_by"]
            isOneToOne: false
            referencedRelation: "uncertainties"
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
      documents: {
        Row: {
          bytes: number
          created_at: string
          evaluation_id: string
          extracted_text: string | null
          extraction_error: string | null
          extraction_status: Database["public"]["Enums"]["extraction_status"]
          filename: string
          fund_id: string
          id: string
          mime_type: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          bytes: number
          created_at?: string
          evaluation_id: string
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          filename: string
          fund_id: string
          id?: string
          mime_type: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          bytes?: number
          created_at?: string
          evaluation_id?: string
          extracted_text?: string | null
          extraction_error?: string | null
          extraction_status?: Database["public"]["Enums"]["extraction_status"]
          filename?: string
          fund_id?: string
          id?: string
          mime_type?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluations: {
        Row: {
          company_id: string
          config_id: string
          created_at: string
          current_step: number
          evaluator_id: string | null
          fund_id: string
          id: string
          status: Database["public"]["Enums"]["evaluation_status"]
          updated_at: string
          uploads_only: boolean
        }
        Insert: {
          company_id: string
          config_id: string
          created_at?: string
          current_step?: number
          evaluator_id?: string | null
          fund_id: string
          id?: string
          status?: Database["public"]["Enums"]["evaluation_status"]
          updated_at?: string
          uploads_only?: boolean
        }
        Update: {
          company_id?: string
          config_id?: string
          created_at?: string
          current_step?: number
          evaluator_id?: string | null
          fund_id?: string
          id?: string
          status?: Database["public"]["Enums"]["evaluation_status"]
          updated_at?: string
          uploads_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "evaluations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "framework_configs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evaluations_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      falsifier_claims: {
        Row: {
          claim_id: string
          falsifier_id: string
          fund_id: string
        }
        Insert: {
          claim_id: string
          falsifier_id: string
          fund_id: string
        }
        Update: {
          claim_id?: string
          falsifier_id?: string
          fund_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "falsifier_claims_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "falsifier_claims_falsifier_id_fkey"
            columns: ["falsifier_id"]
            isOneToOne: false
            referencedRelation: "falsifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "falsifier_claims_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      falsifier_uncertainties: {
        Row: {
          falsifier_id: string
          fund_id: string
          uncertainty_id: string
        }
        Insert: {
          falsifier_id: string
          fund_id: string
          uncertainty_id: string
        }
        Update: {
          falsifier_id?: string
          fund_id?: string
          uncertainty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "falsifier_uncertainties_falsifier_id_fkey"
            columns: ["falsifier_id"]
            isOneToOne: false
            referencedRelation: "falsifiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "falsifier_uncertainties_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "falsifier_uncertainties_uncertainty_id_fkey"
            columns: ["uncertainty_id"]
            isOneToOne: false
            referencedRelation: "uncertainties"
            referencedColumns: ["id"]
          },
        ]
      }
      falsifiers: {
        Row: {
          code: string
          created_at: string
          criterion: string
          evaluation_id: string
          fund_id: string
          id: string
          outcome_check: string
          run_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          criterion: string
          evaluation_id: string
          fund_id: string
          id?: string
          outcome_check: string
          run_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          criterion?: string
          evaluation_id?: string
          fund_id?: string
          id?: string
          outcome_check?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "falsifiers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "falsifiers_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "falsifiers_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
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
      llm_calls: {
        Row: {
          attempt: number
          created_at: string
          error: string | null
          evaluation_id: string | null
          fund_id: string
          id: string
          input: Json
          input_tokens: number | null
          latency_ms: number | null
          model: string
          output: Json | null
          output_tokens: number | null
          prompt_key: string
          prompt_version: string
          run_id: string | null
          validation_errors: Json | null
        }
        Insert: {
          attempt?: number
          created_at?: string
          error?: string | null
          evaluation_id?: string | null
          fund_id: string
          id?: string
          input: Json
          input_tokens?: number | null
          latency_ms?: number | null
          model: string
          output?: Json | null
          output_tokens?: number | null
          prompt_key: string
          prompt_version: string
          run_id?: string | null
          validation_errors?: Json | null
        }
        Update: {
          attempt?: number
          created_at?: string
          error?: string | null
          evaluation_id?: string | null
          fund_id?: string
          id?: string
          input?: Json
          input_tokens?: number | null
          latency_ms?: number | null
          model?: string
          output?: Json | null
          output_tokens?: number | null
          prompt_key?: string
          prompt_version?: string
          run_id?: string | null
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "llm_calls_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_calls_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "llm_calls_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_runs: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          evaluation_id: string
          finished_at: string | null
          fund_id: string
          id: string
          notes: string[]
          progress: number
          started_at: string | null
          status: Database["public"]["Enums"]["run_status"]
          superseded_at: string | null
          step: number
          warnings: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          evaluation_id: string
          finished_at?: string | null
          fund_id: string
          id?: string
          notes?: string[]
          progress?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          superseded_at?: string | null
          step: number
          warnings?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          evaluation_id?: string
          finished_at?: string | null
          fund_id?: string
          id?: string
          notes?: string[]
          progress?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["run_status"]
          superseded_at?: string | null
          step?: number
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pipeline_runs_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
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
      quick_screen_answer_citations: {
        Row: {
          answer_id: string
          created_at: string
          document_id: string
          excerpt: string
          fund_id: string
          id: string
        }
        Insert: {
          answer_id: string
          created_at?: string
          document_id: string
          excerpt: string
          fund_id: string
          id?: string
        }
        Update: {
          answer_id?: string
          created_at?: string
          document_id?: string
          excerpt?: string
          fund_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_screen_answer_citations_answer_id_fkey"
            columns: ["answer_id"]
            isOneToOne: false
            referencedRelation: "quick_screen_answers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_screen_answer_citations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_screen_answer_citations_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_screen_answers: {
        Row: {
          ai_answer: string | null
          answer: string
          created_at: string
          evaluation_id: string
          found_in_materials: boolean | null
          fund_id: string
          id: string
          origin: Database["public"]["Enums"]["answer_origin"]
          question_id: string
          updated_at: string
        }
        Insert: {
          ai_answer?: string | null
          answer: string
          created_at?: string
          evaluation_id: string
          found_in_materials?: boolean | null
          fund_id: string
          id?: string
          origin?: Database["public"]["Enums"]["answer_origin"]
          question_id: string
          updated_at?: string
        }
        Update: {
          ai_answer?: string | null
          answer?: string
          created_at?: string
          evaluation_id?: string
          found_in_materials?: boolean | null
          fund_id?: string
          id?: string
          origin?: Database["public"]["Enums"]["answer_origin"]
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_screen_answers_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_screen_answers_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_screen_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quick_screen_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_screen_memos: {
        Row: {
          created_at: string
          evaluation_id: string
          fund_id: string
          gating_variable: string | null
          id: string
          justification: string
          llm_call_id: string | null
          original_verdict: Database["public"]["Enums"]["verdict"]
          override_reason: string | null
          preliminary_thesis: string
          reeval_trigger: string | null
          reopen_condition: string | null
          uncertainties: string[]
          verdict: Database["public"]["Enums"]["verdict"]
          verdict_overridden_at: string | null
          verdict_overridden_by: string | null
        }
        Insert: {
          created_at?: string
          evaluation_id: string
          fund_id: string
          gating_variable?: string | null
          id?: string
          justification: string
          llm_call_id?: string | null
          original_verdict: Database["public"]["Enums"]["verdict"]
          override_reason?: string | null
          preliminary_thesis: string
          reeval_trigger?: string | null
          reopen_condition?: string | null
          uncertainties: string[]
          verdict: Database["public"]["Enums"]["verdict"]
          verdict_overridden_at?: string | null
          verdict_overridden_by?: string | null
        }
        Update: {
          created_at?: string
          evaluation_id?: string
          fund_id?: string
          gating_variable?: string | null
          id?: string
          justification?: string
          llm_call_id?: string | null
          original_verdict?: Database["public"]["Enums"]["verdict"]
          override_reason?: string | null
          preliminary_thesis?: string
          reeval_trigger?: string | null
          reopen_condition?: string | null
          uncertainties?: string[]
          verdict?: Database["public"]["Enums"]["verdict"]
          verdict_overridden_at?: string | null
          verdict_overridden_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_screen_memos_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: true
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_screen_memos_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_screen_memos_llm_call_id_fkey"
            columns: ["llm_call_id"]
            isOneToOne: false
            referencedRelation: "llm_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_screen_memos_verdict_overridden_by_fkey"
            columns: ["verdict_overridden_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      source_prompt_coverage: {
        Row: {
          created_at: string
          fund_id: string
          prompt_id: string
          source_id: string
        }
        Insert: {
          created_at?: string
          fund_id: string
          prompt_id: string
          source_id: string
        }
        Update: {
          created_at?: string
          fund_id?: string
          prompt_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_prompt_coverage_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_prompt_coverage_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "collection_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "source_prompt_coverage_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          accessed_at: string
          code: string
          content_text: string
          created_at: string
          document_id: string | null
          evaluation_id: string
          fund_id: string
          id: string
          origin: Database["public"]["Enums"]["source_origin"]
          party: string
          published_at: string | null
          relevance_note: string
          run_id: string | null
          tier: Database["public"]["Enums"]["source_tier"]
          title: string
          url: string | null
        }
        Insert: {
          accessed_at?: string
          code: string
          content_text: string
          created_at?: string
          document_id?: string | null
          evaluation_id: string
          fund_id: string
          id?: string
          origin: Database["public"]["Enums"]["source_origin"]
          party: string
          published_at?: string | null
          relevance_note?: string
          run_id?: string | null
          tier: Database["public"]["Enums"]["source_tier"]
          title: string
          url?: string | null
        }
        Update: {
          accessed_at?: string
          code?: string
          content_text?: string
          created_at?: string
          document_id?: string | null
          evaluation_id?: string
          fund_id?: string
          id?: string
          origin?: Database["public"]["Enums"]["source_origin"]
          party?: string
          published_at?: string | null
          relevance_note?: string
          run_id?: string | null
          tier?: Database["public"]["Enums"]["source_tier"]
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sources_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_refs: {
        Row: {
          fund_id: string
          position: number
          ref_id: string
          ref_kind: Database["public"]["Enums"]["statement_ref_kind"]
          statement_id: string
        }
        Insert: {
          fund_id: string
          position?: number
          ref_id: string
          ref_kind: Database["public"]["Enums"]["statement_ref_kind"]
          statement_id: string
        }
        Update: {
          fund_id?: string
          position?: number
          ref_id?: string
          ref_kind?: Database["public"]["Enums"]["statement_ref_kind"]
          statement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "statement_refs_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_refs_statement_id_fkey"
            columns: ["statement_id"]
            isOneToOne: false
            referencedRelation: "statements"
            referencedColumns: ["id"]
          },
        ]
      }
      statements: {
        Row: {
          created_at: string
          detail: string | null
          document: Database["public"]["Enums"]["statement_document"]
          evaluation_id: string
          fund_id: string
          id: string
          position: number
          run_id: string | null
          section: Database["public"]["Enums"]["statement_section"]
          text: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          document: Database["public"]["Enums"]["statement_document"]
          evaluation_id: string
          fund_id: string
          id?: string
          position: number
          run_id?: string | null
          section: Database["public"]["Enums"]["statement_section"]
          text: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          document?: Database["public"]["Enums"]["statement_document"]
          evaluation_id?: string
          fund_id?: string
          id?: string
          position?: number
          run_id?: string | null
          section?: Database["public"]["Enums"]["statement_section"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "statements_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statements_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      uncertainties: {
        Row: {
          code: string
          created_at: string
          decision_critical: boolean
          evaluation_id: string
          from_prompt_id: string | null
          fund_id: string
          id: string
          min_evidence_to_resolve: string | null
          question: string
          run_id: string | null
          status: Database["public"]["Enums"]["uncertainty_status"]
          why_unresolved: string
        }
        Insert: {
          code: string
          created_at?: string
          decision_critical: boolean
          evaluation_id: string
          from_prompt_id?: string | null
          fund_id: string
          id?: string
          min_evidence_to_resolve?: string | null
          question: string
          run_id?: string | null
          status?: Database["public"]["Enums"]["uncertainty_status"]
          why_unresolved: string
        }
        Update: {
          code?: string
          created_at?: string
          decision_critical?: boolean
          evaluation_id?: string
          from_prompt_id?: string | null
          fund_id?: string
          id?: string
          min_evidence_to_resolve?: string | null
          question?: string
          run_id?: string | null
          status?: Database["public"]["Enums"]["uncertainty_status"]
          why_unresolved?: string
        }
        Relationships: [
          {
            foreignKeyName: "uncertainties_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uncertainties_from_prompt_id_fkey"
            columns: ["from_prompt_id"]
            isOneToOne: false
            referencedRelation: "collection_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uncertainties_fund_id_fkey"
            columns: ["fund_id"]
            isOneToOne: false
            referencedRelation: "funds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uncertainties_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "pipeline_runs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_config_draft: { Args: never; Returns: string }
      create_evaluation: {
        Args: {
          p_name: string
          p_sector: string
          p_stage: string
          p_website: string
        }
        Returns: string
      }
      create_fund_with_admin: {
        Args: { p_display_name: string; p_fund_name: string; p_user_id: string }
        Returns: string
      }
      discard_config_draft: { Args: never; Returns: undefined }
      publish_config: { Args: never; Returns: number }
      record_claims: {
        Args: {
          p_claims: Json
          p_conflicts: Json
          p_evaluation_id: string
          p_notes: string[]
          p_run_id: string
          p_uncertainties: Json
          p_warnings: string[]
        }
        Returns: number
      }
      record_counter_case: {
        Args: {
          p_arguments: Json
          p_evaluation_id: string
          p_falsifiers: Json
          p_notes: string[]
          p_run_id: string
          p_uncertainties: Json
          p_warnings: string[]
        }
        Returns: number
      }
      record_dimension_assessments: {
        Args: {
          p_assessments: Json
          p_evaluation_id: string
          p_notes: string[]
          p_run_id: string
          p_warnings: string[]
        }
        Returns: number
      }
      record_synthesis: {
        Args: {
          p_classification: Database["public"]["Enums"]["verdict"]
          p_evaluation_id: string
          p_notes: string[]
          p_reeval_trigger: string
          p_rule_trace: Json
          p_run_id: string
          p_statements: Json
          p_warnings: string[]
        }
        Returns: number
      }
      reset_from_step: {
        Args: {
          p_actor_id: string
          p_confirm_full_reset: boolean
          p_evaluation_id: string
          p_step: number
        }
        Returns: Json
      }
      record_quick_screen: {
        Args: {
          p_answers: Json
          p_evaluation_id: string
          p_llm_call_id: string
          p_memo: Json
          p_run_id: string
        }
        Returns: undefined
      }
      record_quick_screen_drafts: {
        Args: { p_drafts: Json; p_evaluation_id: string; p_run_id: string }
        Returns: undefined
      }
      record_sources: {
        Args: {
          p_conflicts: Json
          p_evaluation_id: string
          p_notes: string[]
          p_run_id: string
          p_sources: Json
          p_warnings: string[]
        }
        Returns: number
      }
      save_config_draft: { Args: { p_config: Json }; Returns: undefined }
    }
    Enums: {
      answer_origin: "analyst" | "ai"
      claim_confidence: "high" | "medium" | "low"
      claim_type: "fact" | "inference" | "speculation"
      config_status: "draft" | "published"
      conflict_kind: "source" | "claim"
      conflict_status: "open" | "resolved_a" | "resolved_b" | "unresolvable"
      evaluation_status:
        | "screening"
        | "passed"
        | "watch"
        | "collecting"
        | "extracting"
        | "stress_testing"
        | "scoring"
        | "synthesizing"
        | "complete"
      extraction_status: "pending" | "extracted" | "no_text" | "failed"
      run_status:
        | "queued"
        | "running"
        | "done"
        | "done_with_warnings"
        | "failed"
      source_origin: "upload" | "web"
      source_tier: "primary" | "secondary" | "tertiary"
      statement_document: "thesis_card" | "decision_snapshot"
      statement_ref_kind: "claim" | "source" | "uncertainty" | "falsifier"
      statement_section:
        | "thesis"
        | "outlier"
        | "base_case"
        | "upside_case"
        | "failure_case"
        | "moat"
        | "entry_wedge"
        | "milestone"
        | "falsifier"
        | "open_question"
        | "justification"
        | "supporting_arg"
        | "risk"
        | "research_agenda"
        | "reeval_trigger"
      uncertainty_status: "open" | "resolved"
      user_role: "analyst" | "admin"
      verdict: "proceed" | "watch" | "pass"
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
      answer_origin: ["analyst", "ai"],
      claim_confidence: ["high", "medium", "low"],
      claim_type: ["fact", "inference", "speculation"],
      config_status: ["draft", "published"],
      conflict_kind: ["source", "claim"],
      conflict_status: ["open", "resolved_a", "resolved_b", "unresolvable"],
      evaluation_status: [
        "screening",
        "passed",
        "watch",
        "collecting",
        "extracting",
        "stress_testing",
        "scoring",
        "synthesizing",
        "complete",
      ],
      extraction_status: ["pending", "extracted", "no_text", "failed"],
      run_status: ["queued", "running", "done", "done_with_warnings", "failed"],
      source_origin: ["upload", "web"],
      source_tier: ["primary", "secondary", "tertiary"],
      statement_document: ["thesis_card", "decision_snapshot"],
      statement_ref_kind: ["claim", "source", "uncertainty", "falsifier"],
      statement_section: [
        "thesis",
        "outlier",
        "base_case",
        "upside_case",
        "failure_case",
        "moat",
        "entry_wedge",
        "milestone",
        "falsifier",
        "open_question",
        "justification",
        "supporting_arg",
        "risk",
        "research_agenda",
        "reeval_trigger",
      ],
      uncertainty_status: ["open", "resolved"],
      user_role: ["analyst", "admin"],
      verdict: ["proceed", "watch", "pass"],
    },
  },
} as const

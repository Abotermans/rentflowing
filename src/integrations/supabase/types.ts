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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      allocation_rule_unit_shares: {
        Row: {
          allocation_rule_id: string
          coefficient: number | null
          created_at: string
          fixed_amount_share: number | null
          id: string
          legacy_id: string | null
          percentage_share: number | null
          portfolio_id: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          allocation_rule_id: string
          coefficient?: number | null
          created_at?: string
          fixed_amount_share?: number | null
          id?: string
          legacy_id?: string | null
          percentage_share?: number | null
          portfolio_id: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          allocation_rule_id?: string
          coefficient?: number | null
          created_at?: string
          fixed_amount_share?: number | null
          id?: string
          legacy_id?: string | null
          percentage_share?: number | null
          portfolio_id?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_rule_unit_shares_allocation_rule_id_fkey"
            columns: ["allocation_rule_id"]
            isOneToOne: false
            referencedRelation: "allocation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rule_unit_shares_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rule_unit_shares_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      allocation_rules: {
        Row: {
          apply_only_to_occupied_units: boolean
          created_at: string
          id: string
          include_unavailable_units: boolean
          legacy_id: string | null
          method: string
          name: string
          notes: string
          portfolio_id: string
          property_id: string
          share_key: string | null
          updated_at: string
        }
        Insert: {
          apply_only_to_occupied_units?: boolean
          created_at?: string
          id?: string
          include_unavailable_units?: boolean
          legacy_id?: string | null
          method?: string
          name?: string
          notes?: string
          portfolio_id: string
          property_id: string
          share_key?: string | null
          updated_at?: string
        }
        Update: {
          apply_only_to_occupied_units?: boolean
          created_at?: string
          id?: string
          include_unavailable_units?: boolean
          legacy_id?: string | null
          method?: string
          name?: string
          notes?: string
          portfolio_id?: string
          property_id?: string
          share_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocation_rules_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocation_rules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_receipts: {
        Row: {
          amount_received: number
          booking_date: string | null
          created_at: string
          currency_code: string
          end_to_end_reference: string | null
          id: string
          import_batch_id: string | null
          lease_id: string | null
          legacy_id: string | null
          notes: string
          payer_bic: string | null
          payer_iban: string | null
          payer_name: string | null
          payment_date: string
          portfolio_id: string
          property_id: string | null
          raw_bank_transaction_id: string | null
          reference: string | null
          remittance_information: string | null
          source_type: string
          status: string
          tenant_id: string | null
          unit_id: string | null
          unmatched_amount: number
          updated_at: string
          value_date: string | null
        }
        Insert: {
          amount_received?: number
          booking_date?: string | null
          created_at?: string
          currency_code?: string
          end_to_end_reference?: string | null
          id?: string
          import_batch_id?: string | null
          lease_id?: string | null
          legacy_id?: string | null
          notes?: string
          payer_bic?: string | null
          payer_iban?: string | null
          payer_name?: string | null
          payment_date: string
          portfolio_id: string
          property_id?: string | null
          raw_bank_transaction_id?: string | null
          reference?: string | null
          remittance_information?: string | null
          source_type?: string
          status?: string
          tenant_id?: string | null
          unit_id?: string | null
          unmatched_amount?: number
          updated_at?: string
          value_date?: string | null
        }
        Update: {
          amount_received?: number
          booking_date?: string | null
          created_at?: string
          currency_code?: string
          end_to_end_reference?: string | null
          id?: string
          import_batch_id?: string | null
          lease_id?: string | null
          legacy_id?: string | null
          notes?: string
          payer_bic?: string | null
          payer_iban?: string | null
          payer_name?: string | null
          payment_date?: string
          portfolio_id?: string
          property_id?: string | null
          raw_bank_transaction_id?: string | null
          reference?: string | null
          remittance_information?: string | null
          source_type?: string
          status?: string
          tenant_id?: string | null
          unit_id?: string | null
          unmatched_amount?: number
          updated_at?: string
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_receipts_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_receipts_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_receipts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_receipts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_receipts_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      charges_reconciliations: {
        Row: {
          actual_recoverable: number
          created_at: string
          delta: number
          id: string
          lease_id: string
          notes: string
          period_end: string
          period_start: string
          portfolio_id: string
          provisions_collected: number
          receivable_item_id: string | null
          resolution: string
          updated_at: string
        }
        Insert: {
          actual_recoverable?: number
          created_at?: string
          delta?: number
          id?: string
          lease_id: string
          notes?: string
          period_end: string
          period_start: string
          portfolio_id: string
          provisions_collected?: number
          receivable_item_id?: string | null
          resolution: string
          updated_at?: string
        }
        Update: {
          actual_recoverable?: number
          created_at?: string
          delta?: number
          id?: string
          lease_id?: string
          notes?: string
          period_end?: string
          period_start?: string
          portfolio_id?: string
          provisions_collected?: number
          receivable_item_id?: string | null
          resolution?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charges_reconciliations_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_reconciliations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_reconciliations_receivable_item_id_fkey"
            columns: ["receivable_item_id"]
            isOneToOne: false
            referencedRelation: "receivable_items"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_allocation_results: {
        Row: {
          allocated_amount: number
          cost_entry_id: string
          created_at: string
          id: string
          legacy_id: string | null
          owner_burden_amount: number
          period_end: string | null
          period_start: string | null
          portfolio_id: string
          property_id: string
          recoverable_amount: number
          recovery_type: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          allocated_amount?: number
          cost_entry_id: string
          created_at?: string
          id?: string
          legacy_id?: string | null
          owner_burden_amount?: number
          period_end?: string | null
          period_start?: string | null
          portfolio_id: string
          property_id: string
          recoverable_amount?: number
          recovery_type?: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          allocated_amount?: number
          cost_entry_id?: string
          created_at?: string
          id?: string
          legacy_id?: string | null
          owner_burden_amount?: number
          period_end?: string | null
          period_start?: string | null
          portfolio_id?: string
          property_id?: string
          recoverable_amount?: number
          recovery_type?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_allocation_results_cost_entry_id_fkey"
            columns: ["cost_entry_id"]
            isOneToOne: false
            referencedRelation: "cost_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_allocation_results_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_allocation_results_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_allocation_results_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_categories: {
        Row: {
          code: string
          created_at: string
          description: string
          id: string
          is_active: boolean
          legacy_id: string | null
          name: string
          nature: string
          portfolio_id: string
          recovery_type_default: string
          scope: string
          updated_at: string
        }
        Insert: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          legacy_id?: string | null
          name?: string
          nature?: string
          portfolio_id: string
          recovery_type_default?: string
          scope?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          legacy_id?: string | null
          name?: string
          nature?: string
          portfolio_id?: string
          recovery_type_default?: string
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_categories_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_entries: {
        Row: {
          allocation_rule_id: string | null
          amount: number
          category_id: string
          created_at: string
          currency_code: string
          description: string
          end_date: string | null
          frequency: string
          id: string
          invoice_reference: string
          is_tax: boolean
          label: string
          legacy_id: string | null
          notes: string
          portfolio_id: string
          property_id: string
          recovery_type: string
          start_date: string
          status: string
          unit_id: string | null
          updated_at: string
          vendor_name: string
        }
        Insert: {
          allocation_rule_id?: string | null
          amount?: number
          category_id: string
          created_at?: string
          currency_code?: string
          description?: string
          end_date?: string | null
          frequency?: string
          id?: string
          invoice_reference?: string
          is_tax?: boolean
          label?: string
          legacy_id?: string | null
          notes?: string
          portfolio_id: string
          property_id: string
          recovery_type?: string
          start_date: string
          status?: string
          unit_id?: string | null
          updated_at?: string
          vendor_name?: string
        }
        Update: {
          allocation_rule_id?: string | null
          amount?: number
          category_id?: string
          created_at?: string
          currency_code?: string
          description?: string
          end_date?: string | null
          frequency?: string
          id?: string
          invoice_reference?: string
          is_tax?: boolean
          label?: string
          legacy_id?: string | null
          notes?: string
          portfolio_id?: string
          property_id?: string
          recovery_type?: string
          start_date?: string
          status?: string
          unit_id?: string | null
          updated_at?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_entries_allocation_rule_id_fkey"
            columns: ["allocation_rule_id"]
            isOneToOne: false
            referencedRelation: "allocation_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "cost_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_entries_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_entries_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      guarantees: {
        Row: {
          created_at: string
          expected_amount: number
          id: string
          lease_id: string
          legacy_id: string | null
          notes: string
          portfolio_id: string
          received_amount: number
          received_date: string | null
          release_date: string | null
          retention_amount: number | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_amount?: number
          id?: string
          lease_id: string
          legacy_id?: string | null
          notes?: string
          portfolio_id: string
          received_amount?: number
          received_date?: string | null
          release_date?: string | null
          retention_amount?: number | null
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_amount?: number
          id?: string
          lease_id?: string
          legacy_id?: string | null
          notes?: string
          portfolio_id?: string
          received_amount?: number
          received_date?: string | null
          release_date?: string | null
          retention_amount?: number | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guarantees_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guarantees_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_amendment_changes: {
        Row: {
          amendment_id: string
          change_type: string
          created_at: string
          field_name: string
          id: string
          legacy_id: string | null
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          portfolio_id: string
          updated_at: string
        }
        Insert: {
          amendment_id: string
          change_type?: string
          created_at?: string
          field_name: string
          id?: string
          legacy_id?: string | null
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          portfolio_id: string
          updated_at?: string
        }
        Update: {
          amendment_id?: string
          change_type?: string
          created_at?: string
          field_name?: string
          id?: string
          legacy_id?: string | null
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          portfolio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_amendment_changes_amendment_id_fkey"
            columns: ["amendment_id"]
            isOneToOne: false
            referencedRelation: "lease_amendments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_amendment_changes_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_amendments: {
        Row: {
          amendment_number: number
          amendment_type: string
          created_at: string
          effective_date: string
          id: string
          lease_id: string
          legacy_id: string | null
          notes: string
          portfolio_id: string
          reason: string
          signed_date: string | null
          status: string
          supersedes_amendment_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amendment_number?: number
          amendment_type?: string
          created_at?: string
          effective_date: string
          id?: string
          lease_id: string
          legacy_id?: string | null
          notes?: string
          portfolio_id: string
          reason?: string
          signed_date?: string | null
          status?: string
          supersedes_amendment_id?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          amendment_number?: number
          amendment_type?: string
          created_at?: string
          effective_date?: string
          id?: string
          lease_id?: string
          legacy_id?: string | null
          notes?: string
          portfolio_id?: string
          reason?: string
          signed_date?: string | null
          status?: string
          supersedes_amendment_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_amendments_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_amendments_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_amendments_supersedes_amendment_id_fkey"
            columns: ["supersedes_amendment_id"]
            isOneToOne: false
            referencedRelation: "lease_amendments"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_documents: {
        Row: {
          created_at: string
          document_date: string
          id: string
          lease_id: string
          mime_type: string | null
          notes: string | null
          original_filename: string
          portfolio_id: string
          size_bytes: number | null
          storage_path: string
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_date: string
          id?: string
          lease_id: string
          mime_type?: string | null
          notes?: string | null
          original_filename: string
          portfolio_id: string
          size_bytes?: number | null
          storage_path: string
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_date?: string
          id?: string
          lease_id?: string
          mime_type?: string | null
          notes?: string | null
          original_filename?: string
          portfolio_id?: string
          size_bytes?: number | null
          storage_path?: string
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lease_documents_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_documents_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      lease_unit_assignments: {
        Row: {
          assignment_type: string
          charges_share: number | null
          created_at: string
          end_date: string | null
          id: string
          lease_id: string
          legacy_id: string | null
          notes: string
          portfolio_id: string
          rent_share: number | null
          start_date: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          assignment_type?: string
          charges_share?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          lease_id: string
          legacy_id?: string | null
          notes?: string
          portfolio_id: string
          rent_share?: number | null
          start_date: string
          unit_id: string
          updated_at?: string
        }
        Update: {
          assignment_type?: string
          charges_share?: number | null
          created_at?: string
          end_date?: string | null
          id?: string
          lease_id?: string
          legacy_id?: string | null
          notes?: string
          portfolio_id?: string
          rent_share?: number | null
          start_date?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lease_unit_assignments_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_unit_assignments_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lease_unit_assignments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      leases: {
        Row: {
          advance_allocation_duration_months: number | null
          advance_allocation_method: string | null
          advance_allocation_start_date: string | null
          advance_applied_to: string | null
          advance_cycle_lead_days: number | null
          advance_payment_amount: number | null
          advance_payment_date: string | null
          billing_tenant_id: string | null
          charges_billing_mode: string
          created_at: string
          deposit_or_guarantee_amount: number | null
          due_day_of_month: number
          end_date: string
          end_reason: string | null
          fixed_monthly_reduction_amount: number | null
          has_advance_payment: boolean
          id: string
          intended_move_out_date: string | null
          key_handover_count: number
          key_return_count: number
          keys: Json
          lease_reference: string
          legacy_id: string | null
          lifecycle_stage: string
          monthly_charges: number
          monthly_rent: number
          move_in_actual_date: string | null
          move_in_checklist: Json
          move_in_meter_reading: string | null
          move_in_scheduled_date: string | null
          move_in_water_meter_reading: string | null
          move_out_actual_date: string | null
          move_out_checklist: Json
          move_out_meter_reading: string | null
          move_out_notes: string
          move_out_scheduled_date: string | null
          move_out_water_meter_reading: string | null
          notes: string
          notice_date: string | null
          notice_given: boolean
          notice_period_text: string
          payer_accounts: Json
          portfolio_id: string
          pricing_mode: string | null
          property_id: string
          rent_formula: number
          return_notes: string
          return_status: string | null
          signed_date: string | null
          start_date: string
          tenant_ids: Json
          termination_reason: string | null
          updated_at: string
        }
        Insert: {
          advance_allocation_duration_months?: number | null
          advance_allocation_method?: string | null
          advance_allocation_start_date?: string | null
          advance_applied_to?: string | null
          advance_cycle_lead_days?: number | null
          advance_payment_amount?: number | null
          advance_payment_date?: string | null
          billing_tenant_id?: string | null
          charges_billing_mode?: string
          created_at?: string
          deposit_or_guarantee_amount?: number | null
          due_day_of_month?: number
          end_date: string
          end_reason?: string | null
          fixed_monthly_reduction_amount?: number | null
          has_advance_payment?: boolean
          id?: string
          intended_move_out_date?: string | null
          key_handover_count?: number
          key_return_count?: number
          keys?: Json
          lease_reference?: string
          legacy_id?: string | null
          lifecycle_stage?: string
          monthly_charges?: number
          monthly_rent?: number
          move_in_actual_date?: string | null
          move_in_checklist?: Json
          move_in_meter_reading?: string | null
          move_in_scheduled_date?: string | null
          move_in_water_meter_reading?: string | null
          move_out_actual_date?: string | null
          move_out_checklist?: Json
          move_out_meter_reading?: string | null
          move_out_notes?: string
          move_out_scheduled_date?: string | null
          move_out_water_meter_reading?: string | null
          notes?: string
          notice_date?: string | null
          notice_given?: boolean
          notice_period_text?: string
          payer_accounts?: Json
          portfolio_id: string
          pricing_mode?: string | null
          property_id: string
          rent_formula?: number
          return_notes?: string
          return_status?: string | null
          signed_date?: string | null
          start_date: string
          tenant_ids?: Json
          termination_reason?: string | null
          updated_at?: string
        }
        Update: {
          advance_allocation_duration_months?: number | null
          advance_allocation_method?: string | null
          advance_allocation_start_date?: string | null
          advance_applied_to?: string | null
          advance_cycle_lead_days?: number | null
          advance_payment_amount?: number | null
          advance_payment_date?: string | null
          billing_tenant_id?: string | null
          charges_billing_mode?: string
          created_at?: string
          deposit_or_guarantee_amount?: number | null
          due_day_of_month?: number
          end_date?: string
          end_reason?: string | null
          fixed_monthly_reduction_amount?: number | null
          has_advance_payment?: boolean
          id?: string
          intended_move_out_date?: string | null
          key_handover_count?: number
          key_return_count?: number
          keys?: Json
          lease_reference?: string
          legacy_id?: string | null
          lifecycle_stage?: string
          monthly_charges?: number
          monthly_rent?: number
          move_in_actual_date?: string | null
          move_in_checklist?: Json
          move_in_meter_reading?: string | null
          move_in_scheduled_date?: string | null
          move_in_water_meter_reading?: string | null
          move_out_actual_date?: string | null
          move_out_checklist?: Json
          move_out_meter_reading?: string | null
          move_out_notes?: string
          move_out_scheduled_date?: string | null
          move_out_water_meter_reading?: string | null
          notes?: string
          notice_date?: string | null
          notice_given?: boolean
          notice_period_text?: string
          payer_accounts?: Json
          portfolio_id?: string
          pricing_mode?: string | null
          property_id?: string
          rent_formula?: number
          return_notes?: string
          return_status?: string | null
          signed_date?: string | null
          start_date?: string
          tenant_ids?: Json
          termination_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leases_billing_tenant_id_fkey"
            columns: ["billing_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leases_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_tickets: {
        Row: {
          assigned_vendor_id: string | null
          category: string
          completed_date: string | null
          created_at: string
          created_date: string
          description: string
          id: string
          internal_notes: string
          legacy_id: string | null
          portfolio_id: string
          priority: string
          property_id: string | null
          resident_visible_notes: string
          scheduled_date: string | null
          status: string
          tenant_id: string | null
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_vendor_id?: string | null
          category?: string
          completed_date?: string | null
          created_at?: string
          created_date?: string
          description?: string
          id?: string
          internal_notes?: string
          legacy_id?: string | null
          portfolio_id: string
          priority?: string
          property_id?: string | null
          resident_visible_notes?: string
          scheduled_date?: string | null
          status?: string
          tenant_id?: string | null
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_vendor_id?: string | null
          category?: string
          completed_date?: string | null
          created_at?: string
          created_date?: string
          description?: string
          id?: string
          internal_notes?: string
          legacy_id?: string | null
          portfolio_id?: string
          priority?: string
          property_id?: string | null
          resident_visible_notes?: string
          scheduled_date?: string | null
          status?: string
          tenant_id?: string | null
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_tickets_assigned_vendor_id_fkey"
            columns: ["assigned_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_tickets_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          portfolio_id: string
          role: Database["public"]["Enums"]["portfolio_role"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          portfolio_id: string
          role?: Database["public"]["Enums"]["portfolio_role"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          portfolio_id?: string
          role?: Database["public"]["Enums"]["portfolio_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_invitations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_members: {
        Row: {
          id: string
          joined_at: string
          portfolio_id: string
          role: Database["public"]["Enums"]["portfolio_role"]
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          portfolio_id: string
          role?: Database["public"]["Enums"]["portfolio_role"]
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          portfolio_id?: string
          role?: Database["public"]["Enums"]["portfolio_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_members_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolios: {
        Row: {
          created_at: string
          created_by: string | null
          default_currency: string
          default_locale: string
          id: string
          name: string
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_locale?: string
          id?: string
          name: string
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_currency?: string
          default_locale?: string
          id?: string
          name?: string
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_portfolio_id: string | null
          first_name: string | null
          id: string
          last_name: string | null
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_portfolio_id?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_portfolio_id?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address1: string
          address2: string
          city: string
          country_code: string
          created_at: string
          currency_code: string
          description: string
          id: string
          legacy_id: string | null
          locale: string
          measurement_system: string
          millieme_base: number
          millieme_keys: string[]
          name: string
          owner_name: string
          portfolio_id: string
          postal_code: string
          property_type: string
          reference_code: string
          region_or_state: string
          status: string
          updated_at: string
        }
        Insert: {
          address1?: string
          address2?: string
          city?: string
          country_code?: string
          created_at?: string
          currency_code?: string
          description?: string
          id?: string
          legacy_id?: string | null
          locale?: string
          measurement_system?: string
          millieme_base?: number
          millieme_keys?: string[]
          name: string
          owner_name?: string
          portfolio_id: string
          postal_code?: string
          property_type?: string
          reference_code?: string
          region_or_state?: string
          status?: string
          updated_at?: string
        }
        Update: {
          address1?: string
          address2?: string
          city?: string
          country_code?: string
          created_at?: string
          currency_code?: string
          description?: string
          id?: string
          legacy_id?: string | null
          locale?: string
          measurement_system?: string
          millieme_base?: number
          millieme_keys?: string[]
          name?: string
          owner_name?: string
          portfolio_id?: string
          postal_code?: string
          property_type?: string
          reference_code?: string
          region_or_state?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      property_owner_links: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          portfolio_id: string
          property_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          portfolio_id: string
          property_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          portfolio_id?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_owner_links_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "property_owners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owner_links_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_owner_links_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_owners: {
        Row: {
          created_at: string
          id: string
          name: string
          portfolio_id: string
          type: Database["public"]["Enums"]["property_owner_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          portfolio_id: string
          type?: Database["public"]["Enums"]["property_owner_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          portfolio_id?: string
          type?: Database["public"]["Enums"]["property_owner_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_owners_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_allocations: {
        Row: {
          allocated_amount: number
          allocation_date: string
          allocation_type: string
          cash_receipt_id: string
          created_at: string
          id: string
          legacy_id: string | null
          notes: string
          portfolio_id: string
          receivable_item_id: string
          updated_at: string
        }
        Insert: {
          allocated_amount?: number
          allocation_date: string
          allocation_type?: string
          cash_receipt_id: string
          created_at?: string
          id?: string
          legacy_id?: string | null
          notes?: string
          portfolio_id: string
          receivable_item_id: string
          updated_at?: string
        }
        Update: {
          allocated_amount?: number
          allocation_date?: string
          allocation_type?: string
          cash_receipt_id?: string
          created_at?: string
          id?: string
          legacy_id?: string | null
          notes?: string
          portfolio_id?: string
          receivable_item_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_allocations_cash_receipt_id_fkey"
            columns: ["cash_receipt_id"]
            isOneToOne: false
            referencedRelation: "cash_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_allocations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_allocations_receivable_item_id_fkey"
            columns: ["receivable_item_id"]
            isOneToOne: false
            referencedRelation: "receivable_items"
            referencedColumns: ["id"]
          },
        ]
      }
      receivable_items: {
        Row: {
          allocated_amount: number
          created_at: string
          currency_code: string
          cycle_end_date: string | null
          cycle_index: number | null
          due_date: string
          expected_amount: number
          id: string
          item_type: string
          label: string
          lease_id: string | null
          legacy_id: string | null
          notes: string
          origin: string
          outstanding_amount: number
          period_month: string | null
          portfolio_id: string
          priority: number
          property_id: string | null
          status: string
          tenant_id: string | null
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          allocated_amount?: number
          created_at?: string
          currency_code?: string
          cycle_end_date?: string | null
          cycle_index?: number | null
          due_date: string
          expected_amount?: number
          id?: string
          item_type?: string
          label?: string
          lease_id?: string | null
          legacy_id?: string | null
          notes?: string
          origin?: string
          outstanding_amount?: number
          period_month?: string | null
          portfolio_id: string
          priority?: number
          property_id?: string | null
          status?: string
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          allocated_amount?: number
          created_at?: string
          currency_code?: string
          cycle_end_date?: string | null
          cycle_index?: number | null
          due_date?: string
          expected_amount?: number
          id?: string
          item_type?: string
          label?: string
          lease_id?: string | null
          legacy_id?: string | null
          notes?: string
          origin?: string
          outstanding_amount?: number
          period_month?: string | null
          portfolio_id?: string
          priority?: number
          property_id?: string | null
          status?: string
          tenant_id?: string | null
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_items_lease_id_fkey"
            columns: ["lease_id"]
            isOneToOne: false
            referencedRelation: "leases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_items_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          company_name: string | null
          contact_first_name: string | null
          contact_last_name: string | null
          contact_role: string | null
          created_at: string
          current_address: string | null
          date_of_birth: string | null
          email: string
          first_name: string
          id: string
          identification_number: string | null
          kind: string
          last_name: string
          legacy_id: string | null
          legal_form: string | null
          notes: string
          phone: string
          portfolio_id: string
          registration_number: string | null
          status: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          company_name?: string | null
          contact_first_name?: string | null
          contact_last_name?: string | null
          contact_role?: string | null
          created_at?: string
          current_address?: string | null
          date_of_birth?: string | null
          email?: string
          first_name?: string
          id?: string
          identification_number?: string | null
          kind?: string
          last_name?: string
          legacy_id?: string | null
          legal_form?: string | null
          notes?: string
          phone?: string
          portfolio_id: string
          registration_number?: string | null
          status?: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          company_name?: string | null
          contact_first_name?: string | null
          contact_last_name?: string | null
          contact_role?: string | null
          created_at?: string
          current_address?: string | null
          date_of_birth?: string | null
          email?: string
          first_name?: string
          id?: string
          identification_number?: string | null
          kind?: string
          last_name?: string
          legacy_id?: string | null
          legal_form?: string | null
          notes?: string
          phone?: string
          portfolio_id?: string
          registration_number?: string | null
          status?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      units: {
        Row: {
          available_from: string | null
          base_charges: number | null
          base_rent: number | null
          bathrooms: number
          bedrooms: number
          created_at: string
          current_status: string
          description: string | null
          floor: number | null
          furnished: boolean
          id: string
          legacy_id: string | null
          millieme_base: number
          millieme_shares: Json
          notes: string
          portfolio_id: string
          property_id: string
          rent_tiers: Json
          surface_area: number | null
          unit_code: string
          unit_label: string
          unit_type: string
          updated_at: string
        }
        Insert: {
          available_from?: string | null
          base_charges?: number | null
          base_rent?: number | null
          bathrooms?: number
          bedrooms?: number
          created_at?: string
          current_status?: string
          description?: string | null
          floor?: number | null
          furnished?: boolean
          id?: string
          legacy_id?: string | null
          millieme_base?: number
          millieme_shares?: Json
          notes?: string
          portfolio_id: string
          property_id: string
          rent_tiers?: Json
          surface_area?: number | null
          unit_code?: string
          unit_label?: string
          unit_type?: string
          updated_at?: string
        }
        Update: {
          available_from?: string | null
          base_charges?: number | null
          base_rent?: number | null
          bathrooms?: number
          bedrooms?: number
          created_at?: string
          current_status?: string
          description?: string | null
          floor?: number | null
          furnished?: boolean
          id?: string
          legacy_id?: string | null
          millieme_base?: number
          millieme_shares?: Json
          notes?: string
          portfolio_id?: string
          property_id?: string
          rent_tiers?: Json
          surface_area?: number | null
          unit_code?: string
          unit_label?: string
          unit_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: string
          contact_name: string
          created_at: string
          email: string
          id: string
          legacy_id: string | null
          notes: string
          phone: string
          portfolio_id: string
          status: string
          trade_category: string
          updated_at: string
          vendor_name: string
        }
        Insert: {
          address?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          legacy_id?: string | null
          notes?: string
          phone?: string
          portfolio_id: string
          status?: string
          trade_category?: string
          updated_at?: string
          vendor_name?: string
        }
        Update: {
          address?: string
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          legacy_id?: string | null
          notes?: string
          phone?: string
          portfolio_id?: string
          status?: string
          trade_category?: string
          updated_at?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_portfolio_role: {
        Args: {
          _portfolio_id: string
          _roles: Database["public"]["Enums"]["portfolio_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      is_portfolio_member: {
        Args: { _portfolio_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      portfolio_role: "owner" | "admin" | "editor" | "viewer"
      property_owner_type: "individual" | "corporation"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      portfolio_role: ["owner", "admin", "editor", "viewer"],
      property_owner_type: ["individual", "corporation"],
    },
  },
} as const

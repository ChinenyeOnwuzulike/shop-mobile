import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://lhfaqrctmpmkljtgoihy.supabase.co",
  "sb_publishable_2LSnuKobYniDx46Fg88NoQ_TAfLHpw4",
  
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);
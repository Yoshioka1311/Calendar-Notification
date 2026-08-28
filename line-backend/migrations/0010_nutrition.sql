CREATE TABLE IF NOT EXISTS food_reference (
  id TEXT PRIMARY KEY NOT NULL,
  name_th TEXT,
  name_en TEXT,
  aliases_json TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL DEFAULT 'other' CHECK(category IN ('protein', 'grain', 'vegetable', 'fruit', 'dairy', 'fat', 'mixed', 'other')),
  source TEXT NOT NULL CHECK(source IN ('thai_fcd', 'usda_fdc', 'manufacturer', 'manual')),
  source_id TEXT,
  serving_basis_grams REAL NOT NULL DEFAULT 100 CHECK(serving_basis_grams > 0),
  energy_kcal REAL NOT NULL CHECK(energy_kcal >= 0),
  protein_g REAL NOT NULL DEFAULT 0 CHECK(protein_g >= 0),
  carbohydrate_g REAL NOT NULL DEFAULT 0 CHECK(carbohydrate_g >= 0),
  fat_g REAL NOT NULL DEFAULT 0 CHECK(fat_g >= 0),
  fiber_g REAL CHECK(fiber_g IS NULL OR fiber_g >= 0),
  sugar_g REAL CHECK(sugar_g IS NULL OR sugar_g >= 0),
  sodium_mg REAL CHECK(sodium_mg IS NULL OR sodium_mg >= 0),
  calcium_mg REAL CHECK(calcium_mg IS NULL OR calcium_mg >= 0),
  iron_mg REAL CHECK(iron_mg IS NULL OR iron_mg >= 0),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_food_reference_source ON food_reference(source, source_id);
CREATE INDEX IF NOT EXISTS idx_food_reference_category ON food_reference(category);

INSERT OR IGNORE INTO food_reference (
  id, name_th, name_en, aliases_json, category, source, source_id,
  serving_basis_grams, energy_kcal, protein_g, carbohydrate_g, fat_g,
  fiber_g, sugar_g, sodium_mg, calcium_mg, iron_mg, updated_at
) VALUES
  ('manual-rice-cooked', 'ข้าวสวย', 'Cooked rice', '["ข้าว","rice","steamed rice","white rice"]', 'grain', 'manual', 'starter-rice-cooked', 100, 130, 2.7, 28.2, 0.3, 0.4, 0.1, 1, 10, 0.2, '2026-08-26T00:00:00.000Z'),
  ('manual-fried-chicken', 'ไก่ทอด', 'Fried chicken', '["chicken","fried chicken","ไก่"]', 'protein', 'manual', 'starter-fried-chicken', 100, 260, 24, 8, 15, 0.2, 0, 520, 15, 1.2, '2026-08-26T00:00:00.000Z'),
  ('manual-fried-egg', 'ไข่ดาว', 'Fried egg', '["egg","fried egg","ไข่"]', 'protein', 'manual', 'starter-fried-egg', 100, 196, 13.6, 0.8, 15.3, 0, 0.4, 207, 62, 1.9, '2026-08-26T00:00:00.000Z'),
  ('manual-omelet', 'ไข่เจียว', 'Thai omelet', '["omelet","omelette","thai omelet"]', 'protein', 'manual', 'starter-omelet', 100, 250, 12, 2, 21, 0, 0.5, 430, 48, 1.6, '2026-08-26T00:00:00.000Z'),
  ('manual-mixed-vegetables', 'ผัก', 'Mixed vegetables', '["vegetables","veg","ผักรวม"]', 'vegetable', 'manual', 'starter-mixed-vegetables', 100, 35, 2, 7, 0.4, 3, 2.5, 35, 35, 0.8, '2026-08-26T00:00:00.000Z'),
  ('manual-banana', 'กล้วย', 'Banana', '["banana","กล้วยหอม","กล้วยน้ำว้า"]', 'fruit', 'manual', 'starter-banana', 100, 89, 1.1, 22.8, 0.3, 2.6, 12.2, 1, 5, 0.3, '2026-08-26T00:00:00.000Z'),
  ('manual-milk', 'นม', 'Milk', '["milk","นมวัว"]', 'dairy', 'manual', 'starter-milk', 100, 61, 3.2, 4.8, 3.3, 0, 5.1, 43, 113, 0, '2026-08-26T00:00:00.000Z'),
  ('manual-khao-man-gai', 'ข้าวมันไก่', 'Chicken rice', '["khao man gai","ข้าวมันไก่ต้ม","chicken rice"]', 'mixed', 'manual', 'starter-khao-man-gai', 100, 215, 8, 26, 8, 0.8, 1.2, 480, 12, 0.7, '2026-08-26T00:00:00.000Z'),
  ('manual-fried-rice', 'ข้าวผัด', 'Fried rice', '["fried rice","ข้าวผัดไข่"]', 'mixed', 'manual', 'starter-fried-rice', 100, 180, 5.2, 27, 5.8, 1.1, 1.5, 410, 20, 0.9, '2026-08-26T00:00:00.000Z'),
  ('manual-noodle-soup', 'ก๋วยเตี๋ยว', 'Noodle soup', '["noodle soup","noodles","ก๋วยเตี๋ยวน้ำ"]', 'mixed', 'manual', 'starter-noodle-soup', 100, 95, 4.2, 15, 2.3, 0.7, 1.2, 390, 18, 0.6, '2026-08-26T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS nutrition_profiles (
  line_user_id TEXT PRIMARY KEY NOT NULL,
  height_cm REAL CHECK(height_cm IS NULL OR height_cm BETWEEN 100 AND 230),
  weight_kg REAL CHECK(weight_kg IS NULL OR weight_kg BETWEEN 30 AND 250),
  age_years INTEGER CHECK(age_years IS NULL OR age_years BETWEEN 10 AND 100),
  sex TEXT NOT NULL DEFAULT 'unspecified' CHECK(sex IN ('male', 'female', 'unspecified')),
  activity_level TEXT NOT NULL DEFAULT 'moderate' CHECK(activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal TEXT NOT NULL DEFAULT 'maintain' CHECK(goal IN ('maintain', 'lose', 'gain')),
  estimated_daily_calories INTEGER,
  target_protein_g INTEGER,
  target_carbohydrate_g INTEGER,
  target_fat_g INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weight_entries (
  id TEXT PRIMARY KEY NOT NULL,
  line_user_id TEXT NOT NULL,
  weight_kg REAL NOT NULL CHECK(weight_kg BETWEEN 30 AND 250),
  measured_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_weight_entries_user_time ON weight_entries(line_user_id, measured_at);

CREATE TABLE IF NOT EXISTS meal_images (
  id TEXT PRIMARY KEY NOT NULL,
  line_user_id TEXT NOT NULL,
  meal_id TEXT,
  storage_key TEXT,
  storage_status TEXT NOT NULL CHECK(storage_status IN ('stored', 'not_configured', 'failed', 'deleted')),
  content_type TEXT,
  byte_size INTEGER,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_meal_images_user_created ON meal_images(line_user_id, created_at);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY NOT NULL,
  line_user_id TEXT NOT NULL,
  consumed_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'unknown' CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'unknown')),
  source TEXT NOT NULL CHECK(source IN ('line_image', 'app_image', 'manual')),
  image_id TEXT,
  total_calories REAL NOT NULL DEFAULT 0,
  total_calories_min REAL,
  total_calories_max REAL,
  total_protein_g REAL NOT NULL DEFAULT 0,
  total_carbohydrate_g REAL NOT NULL DEFAULT 0,
  total_fat_g REAL NOT NULL DEFAULT 0,
  total_fiber_g REAL,
  confidence REAL NOT NULL DEFAULT 0 CHECK(confidence BETWEEN 0 AND 1),
  manually_verified INTEGER NOT NULL DEFAULT 0 CHECK(manually_verified IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'discarded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_meals_user_date_status ON meals(line_user_id, local_date, status);
CREATE INDEX IF NOT EXISTS idx_meals_image_id ON meals(image_id);

CREATE TABLE IF NOT EXISTS meal_items (
  id TEXT PRIMARY KEY NOT NULL,
  meal_id TEXT NOT NULL,
  food_reference_id TEXT,
  detected_name TEXT NOT NULL,
  estimated_grams REAL,
  min_estimated_grams REAL,
  max_estimated_grams REAL,
  calories REAL NOT NULL DEFAULT 0,
  calories_min REAL,
  calories_max REAL,
  protein_g REAL NOT NULL DEFAULT 0,
  carbohydrate_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  fiber_g REAL,
  sodium_mg REAL,
  identification_confidence REAL NOT NULL DEFAULT 0 CHECK(identification_confidence BETWEEN 0 AND 1),
  portion_confidence REAL NOT NULL DEFAULT 0 CHECK(portion_confidence BETWEEN 0 AND 1),
  match_confidence REAL NOT NULL DEFAULT 0 CHECK(match_confidence BETWEEN 0 AND 1),
  manually_verified INTEGER NOT NULL DEFAULT 0 CHECK(manually_verified IN (0, 1)),
  calculation_source TEXT NOT NULL CHECK(calculation_source IN ('thai_fcd', 'usda_fdc', 'manufacturer', 'manual', 'unmatched')),
  notes TEXT,
  FOREIGN KEY(meal_id) REFERENCES meals(id) ON DELETE CASCADE,
  FOREIGN KEY(food_reference_id) REFERENCES food_reference(id)
);

CREATE INDEX IF NOT EXISTS idx_meal_items_meal ON meal_items(meal_id);

CREATE TABLE IF NOT EXISTS nutrition_daily_summary (
  line_user_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  calories REAL NOT NULL DEFAULT 0,
  protein_g REAL NOT NULL DEFAULT 0,
  carbohydrate_g REAL NOT NULL DEFAULT 0,
  fat_g REAL NOT NULL DEFAULT 0,
  fiber_g REAL,
  meal_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(line_user_id, local_date)
);

CREATE TABLE IF NOT EXISTS line_nutrition_sessions (
  line_user_id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('calorie_waiting_for_image', 'calorie_review', 'calorie_correction')),
  pending_meal_id TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_line_nutrition_sessions_expiry ON line_nutrition_sessions(expires_at);

CREATE TABLE IF NOT EXISTS food_analysis_logs (
  id TEXT PRIMARY KEY NOT NULL,
  meal_id TEXT NOT NULL,
  line_user_id TEXT NOT NULL,
  detected_name TEXT NOT NULL,
  matched_food_reference_id TEXT,
  estimated_grams REAL,
  calculation_source TEXT NOT NULL,
  identification_confidence REAL,
  portion_confidence REAL,
  match_confidence REAL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_food_analysis_logs_meal ON food_analysis_logs(meal_id);

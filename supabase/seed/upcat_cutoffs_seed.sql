-- UPCAT campus/program cutoffs seed (Epic E). Campus-level 2019 reference (is_estimate) + two 2025 program rows.
INSERT INTO upcat_cutoffs (id, campus, program, cutoff, year, is_estimate) VALUES
('updiliman-2019','UP Diliman',NULL,2.174,2019,true),
('upbaguio-2019','UP Baguio',NULL,2.421,2019,true),
('upmanila-2019','UP Manila',NULL,2.580,2019,true),
('upcebu-2019','UP Cebu',NULL,2.700,2019,true),
('uplosbanos-2019','UP Los Baños',NULL,2.800,2019,true),
('upmindanao-2019','UP Mindanao',NULL,2.800,2019,true),
('upvisayas-2019','UP Visayas',NULL,2.800,2019,true),
('upou-2019','UP Open University',NULL,2.800,2019,true),
('updiliman-cs-2025','UP Diliman','BS Computer Science',1.550,2025,false),
('updiliman-arch-2025','UP Diliman','BS Architecture',1.600,2025,false)
ON CONFLICT (id) DO UPDATE SET campus=EXCLUDED.campus, program=EXCLUDED.program, cutoff=EXCLUDED.cutoff, year=EXCLUDED.year, is_estimate=EXCLUDED.is_estimate;

-- Pre-Phase-1 PostgreSQL schema fixture. Contains no school data or credentials.

CREATE TYPE eccdanswer AS ENUM ('KAYA', 'DI_KAYA');

CREATE TYPE gender AS ENUM ('MALE', 'FEMALE');

CREATE TYPE handedness AS ENUM ('LEFT', 'RIGHT');

CREATE TYPE senderrole AS ENUM ('TEACHER', 'PARENT');

CREATE TYPE testingperiod AS ENUM ('PRE', 'MID', 'POST');

CREATE TYPE userrole AS ENUM ('super-admin', 'admin', 'user');


CREATE TABLE eccd_domains (
	domain_id SERIAL NOT NULL, 
	domain_name VARCHAR(100) NOT NULL, 
	CONSTRAINT eccd_domains_pkey PRIMARY KEY (domain_id)
)

;


CREATE TABLE email_verifications (
	id SERIAL NOT NULL, 
	email VARCHAR(100) NOT NULL, 
	otp VARCHAR(10) NOT NULL, 
	expires_at TIMESTAMP WITHOUT TIME ZONE NOT NULL, 
	CONSTRAINT email_verifications_pkey PRIMARY KEY (id)
)

;

CREATE INDEX ix_email_verifications_email ON email_verifications (email);


CREATE TABLE system_settings (
	id INTEGER NOT NULL, 
	system_title VARCHAR(255), 
	primary_color VARCHAR(10), 
	secondary_color VARCHAR(10), 
	logo_url TEXT, 
	profile_pic_url TEXT, 
	current_school_year VARCHAR(20), 
	previous_school_year VARCHAR(20), 
	last_rollover_timestamp VARCHAR(100), 
	login_background TEXT, 
	CONSTRAINT system_settings_pkey PRIMARY KEY (id)
)

;


CREATE TABLE users (
	user_id SERIAL NOT NULL, 
	username VARCHAR(50) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	email VARCHAR(100), 
	role userrole, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(), 
	is_active BOOLEAN, 
	otp_code VARCHAR(10), 
	otp_expires_at TIMESTAMP WITHOUT TIME ZONE, 
	CONSTRAINT users_pkey PRIMARY KEY (user_id), 
	CONSTRAINT users_email_key UNIQUE NULLS DISTINCT (email), 
	CONSTRAINT users_username_key UNIQUE NULLS DISTINCT (username)
)

;


CREATE TABLE eccd_questions (
	question_id SERIAL NOT NULL, 
	domain_id INTEGER NOT NULL, 
	question_text TEXT NOT NULL, 
	sequence_order INTEGER NOT NULL, 
	is_home_based BOOLEAN, 
	CONSTRAINT eccd_questions_pkey PRIMARY KEY (question_id), 
	CONSTRAINT eccd_questions_domain_id_fkey FOREIGN KEY(domain_id) REFERENCES eccd_domains (domain_id) ON DELETE CASCADE
)

;


CREATE TABLE parents (
	parent_id SERIAL NOT NULL, 
	user_id INTEGER, 
	fullname VARCHAR(100), 
	educational_attainment VARCHAR(20), 
	occupation VARCHAR(50), 
	age INTEGER, 
	relationship_type VARCHAR(50), 
	CONSTRAINT parents_pkey PRIMARY KEY (parent_id), 
	CONSTRAINT parents_user_id_fkey FOREIGN KEY(user_id) REFERENCES users (user_id) ON DELETE CASCADE, 
	CONSTRAINT parents_user_id_key UNIQUE NULLS DISTINCT (user_id)
)

;


CREATE TABLE system_logs (
	log_id SERIAL NOT NULL, 
	user_id INTEGER, 
	action_type VARCHAR(50) NOT NULL, 
	details VARCHAR(255), 
	timestamp TIMESTAMP WITHOUT TIME ZONE DEFAULT now(), 
	CONSTRAINT system_logs_pkey PRIMARY KEY (log_id), 
	CONSTRAINT system_logs_user_id_fkey FOREIGN KEY(user_id) REFERENCES users (user_id) ON DELETE SET NULL
)

;


CREATE TABLE teachers (
	teacher_id SERIAL NOT NULL, 
	user_id INTEGER, 
	first_name VARCHAR(100), 
	last_name VARCHAR(100), 
	employee_id VARCHAR(50), 
	class_name VARCHAR(50), 
	allow_parent_view_student_info BOOLEAN, 
	allow_parent_view_eccd_pre BOOLEAN, 
	allow_parent_view_eccd_mid BOOLEAN, 
	allow_parent_view_eccd_post BOOLEAN, 
	allow_parent_edit_student_info BOOLEAN, 
	allow_parent_edit_home_based_eccd BOOLEAN, 
	allow_eccd_question_management BOOLEAN NOT NULL, 
	CONSTRAINT teachers_pkey PRIMARY KEY (teacher_id), 
	CONSTRAINT teachers_user_id_fkey FOREIGN KEY(user_id) REFERENCES users (user_id) ON DELETE CASCADE, 
	CONSTRAINT teachers_employee_id_key UNIQUE NULLS DISTINCT (employee_id), 
	CONSTRAINT teachers_user_id_key UNIQUE NULLS DISTINCT (user_id)
)

;


CREATE TABLE messages (
	message_id SERIAL NOT NULL, 
	parent_id INTEGER NOT NULL, 
	teacher_id INTEGER NOT NULL, 
	sender_role senderrole NOT NULL, 
	subject VARCHAR(255), 
	body TEXT NOT NULL, 
	is_read BOOLEAN, 
	is_archived BOOLEAN, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(), 
	CONSTRAINT messages_pkey PRIMARY KEY (message_id), 
	CONSTRAINT messages_parent_id_fkey FOREIGN KEY(parent_id) REFERENCES parents (parent_id) ON DELETE CASCADE, 
	CONSTRAINT messages_teacher_id_fkey FOREIGN KEY(teacher_id) REFERENCES teachers (teacher_id) ON DELETE CASCADE
)

;


CREATE TABLE sections (
	section_id SERIAL NOT NULL, 
	section_name VARCHAR(100) NOT NULL, 
	adviser_teacher_id INTEGER, 
	created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now(), 
	CONSTRAINT sections_pkey PRIMARY KEY (section_id), 
	CONSTRAINT sections_adviser_teacher_id_fkey FOREIGN KEY(adviser_teacher_id) REFERENCES teachers (teacher_id) ON DELETE SET NULL, 
	CONSTRAINT sections_section_name_key UNIQUE NULLS DISTINCT (section_name)
)

;


CREATE TABLE section_teachers (
	id SERIAL NOT NULL, 
	section_id INTEGER NOT NULL, 
	teacher_id INTEGER NOT NULL, 
	role VARCHAR(50) NOT NULL, 
	status VARCHAR(20) NOT NULL, 
	assigned_date TIMESTAMP WITHOUT TIME ZONE DEFAULT now(), 
	CONSTRAINT section_teachers_pkey PRIMARY KEY (id), 
	CONSTRAINT section_teachers_section_id_fkey FOREIGN KEY(section_id) REFERENCES sections (section_id) ON DELETE CASCADE, 
	CONSTRAINT section_teachers_teacher_id_fkey FOREIGN KEY(teacher_id) REFERENCES teachers (teacher_id) ON DELETE CASCADE
)

;


CREATE TABLE students (
	lrn_number VARCHAR(50) NOT NULL, 
	first_name VARCHAR(100), 
	last_name VARCHAR(100), 
	date_of_birth DATE, 
	gender gender, 
	section_id INTEGER, 
	section_name VARCHAR(50), 
	address VARCHAR(100), 
	handedness handedness, 
	num_of_siblings INTEGER, 
	birth_order VARCHAR(50), 
	emergency_contact VARCHAR(20), 
	is_active BOOLEAN, 
	school_year VARCHAR(20), 
	CONSTRAINT students_pkey PRIMARY KEY (lrn_number), 
	CONSTRAINT fk_student_section FOREIGN KEY(section_id) REFERENCES sections (section_id) ON DELETE SET NULL
)

;


CREATE TABLE family_access (
	id SERIAL NOT NULL, 
	parent_id INTEGER NOT NULL, 
	student_lrn VARCHAR(50) NOT NULL, 
	relationship_type VARCHAR(50), 
	CONSTRAINT family_access_pkey PRIMARY KEY (id), 
	CONSTRAINT family_access_parent_id_fkey FOREIGN KEY(parent_id) REFERENCES parents (parent_id) ON DELETE CASCADE, 
	CONSTRAINT family_access_student_lrn_fkey FOREIGN KEY(student_lrn) REFERENCES students (lrn_number) ON DELETE CASCADE
)

;


CREATE TABLE student_eccd_evaluations (
	evaluation_id SERIAL NOT NULL, 
	student_lrn VARCHAR(50) NOT NULL, 
	teacher_id INTEGER, 
	question_id INTEGER NOT NULL, 
	testing_period testingperiod NOT NULL, 
	answer eccdanswer NOT NULL, 
	evaluation_date DATE NOT NULL, 
	CONSTRAINT student_eccd_evaluations_pkey PRIMARY KEY (evaluation_id), 
	CONSTRAINT student_eccd_evaluations_question_id_fkey FOREIGN KEY(question_id) REFERENCES eccd_questions (question_id) ON DELETE CASCADE, 
	CONSTRAINT student_eccd_evaluations_student_lrn_fkey FOREIGN KEY(student_lrn) REFERENCES students (lrn_number) ON DELETE CASCADE, 
	CONSTRAINT student_eccd_evaluations_teacher_id_fkey FOREIGN KEY(teacher_id) REFERENCES teachers (teacher_id) ON DELETE SET NULL, 
	CONSTRAINT unique_student_eval UNIQUE NULLS DISTINCT (student_lrn, question_id, testing_period)
)

;

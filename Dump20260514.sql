CREATE DATABASE  IF NOT EXISTS `security_system_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `security_system_db`;
-- MySQL dump 10.13  Distrib 8.0.45, for Win64 (x86_64)
--
-- Host: 127.0.0.1    Database: security_system_db
-- ------------------------------------------------------
-- Server version	9.6.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
SET @MYSQLDUMP_TEMP_LOG_BIN = @@SESSION.SQL_LOG_BIN;
SET @@SESSION.SQL_LOG_BIN= 0;

--
-- GTID state at the beginning of the backup 
--

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '3bd31b54-ffea-11f0-82d0-74d4dd636397:1-1031';

--
-- Table structure for table `alert_receipts`
--

DROP TABLE IF EXISTS `alert_receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alert_receipts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `alert_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `read_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `alert_id` (`alert_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `alert_receipts_ibfk_1` FOREIGN KEY (`alert_id`) REFERENCES `emergency_alerts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `alert_receipts_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alert_receipts`
--

LOCK TABLES `alert_receipts` WRITE;
/*!40000 ALTER TABLE `alert_receipts` DISABLE KEYS */;
INSERT INTO `alert_receipts` VALUES (1,3,6,'2026-05-13 14:47:04'),(2,4,6,NULL);
/*!40000 ALTER TABLE `alert_receipts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `appointment_visitors`
--

DROP TABLE IF EXISTS `appointment_visitors`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `appointment_visitors` (
  `id` int NOT NULL AUTO_INCREMENT,
  `appointment_id` int NOT NULL,
  `visitor_name` varchar(100) NOT NULL,
  `ble_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `appointment_id` (`appointment_id`),
  CONSTRAINT `appointment_visitors_ibfk_1` FOREIGN KEY (`appointment_id`) REFERENCES `visitor_requests` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `appointment_visitors`
--

LOCK TABLES `appointment_visitors` WRITE;
/*!40000 ALTER TABLE `appointment_visitors` DISABLE KEYS */;
INSERT INTO `appointment_visitors` VALUES (1,15,'Aliah','BLE-3F-A3');
/*!40000 ALTER TABLE `appointment_visitors` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance`
--

DROP TABLE IF EXISTS `attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(50) DEFAULT NULL,
  `date` date NOT NULL,
  `time_in` time DEFAULT NULL,
  `time_out` time DEFAULT NULL,
  `status` enum('present','late','absent','on leave') DEFAULT NULL,
  `location` varchar(500) DEFAULT NULL,
  `total_hours` decimal(5,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_date` (`user_id`,`date`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance`
--

LOCK TABLES `attendance` WRITE;
/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
INSERT INTO `attendance` VALUES (1,'E002','2026-04-07','19:16:24','20:00:41','present','G2Q2+388, Pasay City',0.00),(2,'E002','2026-04-14',NULL,NULL,'on leave','Remote/Leave',0.00),(3,'E002','2026-04-17',NULL,NULL,'on leave','Remote/Leave',0.00),(4,'E002','2026-05-05',NULL,NULL,'on leave','Remote/Leave',0.00),(5,'E002','2026-05-01','15:00:00','17:00:00','present','Appeal Approved',2.00),(9,'E002','2026-05-02','20:33:25','22:22:09','late','Pearl Drive, Pasay City',0.00),(10,'E007','2026-05-02','22:33:41','22:41:21','late','España Boulevard, Quezon City',0.00),(11,'E002','2026-05-06',NULL,'10:15:21','on leave','Tower 3, S Residences, Lot 2, Barangay 76, Zone 10, Central Business Park 1-A, 1300, Pasay City',0.00),(12,'E009','2026-05-06','03:34:06','10:15:08','late','Tower 3, S Residences, Lot 2, Barangay 76, Zone 10, Central Business Park 1-A, 1300, Pasay City',0.00),(13,'E006','2026-05-06','13:18:52',NULL,'late','Coral Way, Pasay City',0.00),(14,'E006','2026-05-12',NULL,NULL,'on leave','Remote/Leave',0.00);
/*!40000 ALTER TABLE `attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_appeals`
--

DROP TABLE IF EXISTS `attendance_appeals`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_appeals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(50) NOT NULL,
  `date` date NOT NULL,
  `reason` text NOT NULL,
  `image_url` varchar(500) DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `admin_remarks` text,
  `submitted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `time_in` time DEFAULT NULL,
  `time_out` time DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `attendance_appeals_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_appeals`
--

LOCK TABLES `attendance_appeals` WRITE;
/*!40000 ALTER TABLE `attendance_appeals` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_appeals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ble_tags`
--

DROP TABLE IF EXISTS `ble_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ble_tags` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ble_id` varchar(50) NOT NULL,
  `label` varchar(100) DEFAULT NULL,
  `mac_address` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ble_id` (`ble_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ble_tags`
--

LOCK TABLES `ble_tags` WRITE;
/*!40000 ALTER TABLE `ble_tags` DISABLE KEYS */;
INSERT INTO `ble_tags` VALUES (1,'BLE-3F-A1','Tag A1',NULL),(2,'BLE-3F-A2','Tag A2',NULL),(3,'BLE-3F-A3','Tag A3',NULL),(4,'BLE-5F-B1','Tag B1',NULL),(5,'BLE-5F-B2','Tag B2',NULL);
/*!40000 ALTER TABLE `ble_tags` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chat_messages`
--

DROP TABLE IF EXISTS `chat_messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_messages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `room_id` int NOT NULL,
  `user_id` int NOT NULL,
  `message` text NOT NULL,
  `sent_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `room_id` (`room_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `chat_messages_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `chat_rooms` (`id`),
  CONSTRAINT `chat_messages_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_messages`
--

LOCK TABLES `chat_messages` WRITE;
/*!40000 ALTER TABLE `chat_messages` DISABLE KEYS */;
INSERT INTO `chat_messages` VALUES (2,7,9,'hi','2026-05-10 13:27:05'),(3,7,15,'hello','2026-05-10 13:32:39'),(5,7,9,'hello','2026-05-10 13:59:40'),(6,7,15,'hi','2026-05-10 14:06:08'),(7,7,9,'hello','2026-05-10 14:11:45'),(8,7,9,'hi','2026-05-10 14:17:37'),(9,9,15,'hi','2026-05-10 15:11:43'),(10,10,15,'hi','2026-05-12 15:30:22');
/*!40000 ALTER TABLE `chat_messages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chat_room_members`
--

DROP TABLE IF EXISTS `chat_room_members`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_room_members` (
  `room_id` int NOT NULL,
  `user_id` int NOT NULL,
  `joined_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`room_id`,`user_id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `chat_room_members_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `chat_rooms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_room_members_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_room_members`
--

LOCK TABLES `chat_room_members` WRITE;
/*!40000 ALTER TABLE `chat_room_members` DISABLE KEYS */;
INSERT INTO `chat_room_members` VALUES (9,1,'2026-05-10 15:11:40'),(9,6,'2026-05-10 15:11:40'),(9,9,'2026-05-10 15:11:40'),(9,15,'2026-05-10 15:11:40'),(9,17,'2026-05-10 15:11:40');
/*!40000 ALTER TABLE `chat_room_members` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `chat_rooms`
--

DROP TABLE IF EXISTS `chat_rooms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `chat_rooms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `type` enum('group','direct') DEFAULT 'group',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `chat_rooms`
--

LOCK TABLES `chat_rooms` WRITE;
/*!40000 ALTER TABLE `chat_rooms` DISABLE KEYS */;
INSERT INTO `chat_rooms` VALUES (1,'General','group','2026-05-08 05:04:08'),(2,'Security','group','2026-05-08 05:04:08'),(3,'HR','group','2026-05-08 05:04:08'),(4,'Academics','group','2026-05-08 05:04:08'),(7,'dm_9_15','direct','2026-05-10 13:27:03'),(9,'TEAM X0','group','2026-05-10 15:11:40'),(10,'dm_6_15','direct','2026-05-12 15:30:19');
/*!40000 ALTER TABLE `chat_rooms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courses`
--

LOCK TABLES `courses` WRITE;
/*!40000 ALTER TABLE `courses` DISABLE KEYS */;
INSERT INTO `courses` VALUES (3,'Allied Health 2'),(1,'Healthcare101');
/*!40000 ALTER TABLE `courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `emergency_alerts`
--

DROP TABLE IF EXISTS `emergency_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `emergency_alerts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `message` text NOT NULL,
  `severity` enum('info','warning','critical') DEFAULT 'info',
  `target_roles` json DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `emergency_alerts`
--

LOCK TABLES `emergency_alerts` WRITE;
/*!40000 ALTER TABLE `emergency_alerts` DISABLE KEYS */;
INSERT INTO `emergency_alerts` VALUES (1,'Typhoon','No work','warning','[\"instructor\"]','2026-05-13 14:24:10',NULL,1),(2,'fgjf','jhkururu','info','[\"instructor\"]','2026-05-13 14:24:39',NULL,1),(3,'zsgfgfd','fvszsf','info','[\"instructor\"]','2026-05-13 14:35:40',NULL,1),(4,'dghghs','bvsdfddbgbs','warning','[\"instructor\"]','2026-05-13 14:56:27',NULL,1);
/*!40000 ALTER TABLE `emergency_alerts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employee_documents`
--

DROP TABLE IF EXISTS `employee_documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `employee_id` varchar(50) DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `uploaded_by` int DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `employee_documents_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_documents`
--

LOCK TABLES `employee_documents` WRITE;
/*!40000 ALTER TABLE `employee_documents` DISABLE KEYS */;
INSERT INTO `employee_documents` VALUES (1,6,'E006','Proof','/uploads/documents/leave_1778577728106-844860394.png',15,'2026-05-12 09:22:08');
/*!40000 ALTER TABLE `employee_documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `employee_leave_balances`
--

DROP TABLE IF EXISTS `employee_leave_balances`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee_leave_balances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `leave_type_id` int NOT NULL,
  `remaining_days` decimal(5,2) NOT NULL DEFAULT '0.00',
  `year` int NOT NULL,
  `last_updated` date DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_balance` (`user_id`,`leave_type_id`,`year`),
  KEY `leave_type_id` (`leave_type_id`),
  CONSTRAINT `employee_leave_balances_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `employee_leave_balances_ibfk_2` FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `employee_leave_balances`
--

LOCK TABLES `employee_leave_balances` WRITE;
/*!40000 ALTER TABLE `employee_leave_balances` DISABLE KEYS */;
INSERT INTO `employee_leave_balances` VALUES (1,17,1,15.00,2026,'2026-05-13'),(2,15,1,15.00,2026,'2026-05-13'),(3,9,1,15.00,2026,'2026-05-13'),(4,6,1,15.00,2026,'2026-05-13'),(5,17,2,15.00,2026,'2026-05-13'),(6,15,2,15.00,2026,'2026-05-13'),(7,9,2,15.00,2026,'2026-05-13'),(8,6,2,15.00,2026,'2026-05-13'),(9,17,3,5.00,2026,'2026-05-13'),(10,15,3,5.00,2026,'2026-05-13'),(11,9,3,5.00,2026,'2026-05-13'),(12,6,3,5.00,2026,'2026-05-13');
/*!40000 ALTER TABLE `employee_leave_balances` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(100) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `place` varchar(255) DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `type` varchar(100) NOT NULL,
  `description` text,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
INSERT INTO `events` VALUES (7,'MMM','2026-05-08','LLLL','10:04:00','20:04:00','Meeting',''),(8,'Nutrition month','2026-05-15','Room 101','06:51:00','00:00:00','School Event',''),(9,'RE-ORAL','2026-05-19','NU-MOA','12:00:00','00:00:00','School Event','');
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hr_policies`
--

DROP TABLE IF EXISTS `hr_policies`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hr_policies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `file_path` varchar(500) DEFAULT NULL,
  `uploaded_by` int DEFAULT NULL,
  `uploaded_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `uploaded_by` (`uploaded_by`),
  CONSTRAINT `hr_policies_ibfk_1` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hr_policies`
--

LOCK TABLES `hr_policies` WRITE;
/*!40000 ALTER TABLE `hr_policies` DISABLE KEYS */;
/*!40000 ALTER TABLE `hr_policies` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `job_applicants`
--

DROP TABLE IF EXISTS `job_applicants`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_applicants` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_id` int NOT NULL,
  `full_name` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `cover_letter` text,
  `resume_path` varchar(500) DEFAULT NULL,
  `status` enum('new','reviewed','shortlisted','rejected') DEFAULT 'new',
  `applied_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `score` decimal(5,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `job_id` (`job_id`),
  CONSTRAINT `job_applicants_ibfk_1` FOREIGN KEY (`job_id`) REFERENCES `job_postings` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `job_applicants`
--

LOCK TABLES `job_applicants` WRITE;
/*!40000 ALTER TABLE `job_applicants` DISABLE KEYS */;
INSERT INTO `job_applicants` VALUES (1,1,'Kim Jean Yap','yapkimjean@gmail.com','09263909480','afadfd','/uploads/resumes/resume_1778582970704-517722664.pdf','shortlisted','2026-05-12 10:49:30',0.00);
/*!40000 ALTER TABLE `job_applicants` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `job_postings`
--

DROP TABLE IF EXISTS `job_postings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `job_postings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `department` varchar(100) DEFAULT NULL,
  `description` text,
  `requirements` text,
  `employment_type` varchar(50) DEFAULT NULL,
  `status` enum('open','closed') DEFAULT 'open',
  `posted_by` int DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `posted_by` (`posted_by`),
  CONSTRAINT `job_postings_ibfk_1` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `job_postings`
--

LOCK TABLES `job_postings` WRITE;
/*!40000 ALTER TABLE `job_postings` DISABLE KEYS */;
INSERT INTO `job_postings` VALUES (1,'NEED NEW SIMULATIONIST','EDUCATION','NEED ADAAafAFafADF','afDAFWFWfweSA','Full-time',NULL,15,'2026-05-12 10:23:11'),(2,'Looking for new instructor','Education','adasfdas','afafa','Part-time','open',15,'2026-05-12 13:03:26');
/*!40000 ALTER TABLE `job_postings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `leave_requests`
--

DROP TABLE IF EXISTS `leave_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leave_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(50) DEFAULT NULL,
  `employee_id` varchar(50) DEFAULT NULL,
  `full_name` varchar(255) DEFAULT NULL,
  `request_date` datetime DEFAULT NULL,
  `reason` text,
  `status` enum('Pending','Approved','Rejected') DEFAULT 'Pending',
  `admin_remarks` text,
  `is_hidden` tinyint(1) DEFAULT '0',
  `type` varchar(50) NOT NULL DEFAULT 'Sick Leave',
  `image_url` varchar(500) DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leave_requests`
--

LOCK TABLES `leave_requests` WRITE;
/*!40000 ALTER TABLE `leave_requests` DISABLE KEYS */;
INSERT INTO `leave_requests` VALUES (2,'E002',NULL,NULL,'2026-04-14 00:00:00','family','Approved',NULL,1,'Emergency',NULL,'2026-04-30 15:57:25'),(3,'E002',NULL,NULL,'2026-04-17 00:00:00','manila','Approved',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(4,'E002',NULL,NULL,'2026-04-20 00:00:00','dddd','Rejected',NULL,1,'Emergency',NULL,'2026-04-30 15:57:25'),(5,'E002',NULL,NULL,'2026-04-22 00:00:00','sss','Rejected',NULL,0,'Sick Leave',NULL,'2026-04-30 15:57:25'),(6,'E002',NULL,NULL,'2026-05-05 00:00:00','lagnat','Approved',NULL,1,'Sick Leave',NULL,'2026-04-30 15:57:25'),(7,'E002',NULL,NULL,'2026-05-07 00:00:00','bday','Rejected',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(8,'E002',NULL,NULL,'2026-05-08 00:00:00','monthsary','Rejected',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(9,'E002',NULL,NULL,'2026-05-09 00:00:00','Anniv','Rejected',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(10,'E002',NULL,NULL,'2026-05-15 00:00:00','pain','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 15:57:25'),(11,'E002',NULL,NULL,'2026-04-30 00:00:00','ss','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 18:33:21'),(12,'E002',NULL,NULL,'2026-05-22 00:00:00','gd','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 18:34:04'),(13,'E002',NULL,NULL,'2026-04-30 00:00:00','fsdfdd','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 18:34:25'),(14,'E002',NULL,NULL,'2026-05-06 00:00:00','sick','Approved',NULL,1,'Sick Leave',NULL,'2026-05-05 15:38:07'),(15,'E002',NULL,NULL,'2026-05-07 00:00:00','Fever','Rejected',NULL,1,'Sick Leave',NULL,'2026-05-05 19:28:02'),(16,'E002',NULL,NULL,'2026-05-11 00:00:00','vacation','Pending',NULL,0,'Sick Leave',NULL,'2026-05-08 08:17:44'),(17,'E006',NULL,NULL,'2026-05-12 00:00:00','sixk','Approved',NULL,1,'Sick Leave',NULL,'2026-05-10 15:43:20');
/*!40000 ALTER TABLE `leave_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `leave_types`
--

DROP TABLE IF EXISTS `leave_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leave_types` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(50) NOT NULL,
  `annual_quota` decimal(5,2) NOT NULL,
  `carry_over_limit` decimal(5,2) DEFAULT '0.00',
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leave_types`
--

LOCK TABLES `leave_types` WRITE;
/*!40000 ALTER TABLE `leave_types` DISABLE KEYS */;
INSERT INTO `leave_types` VALUES (1,'Sick Leave',15.00,5.00,1),(2,'Vacation Leave',15.00,5.00,1),(3,'Emergency Leave',5.00,0.00,1);
/*!40000 ALTER TABLE `leave_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payroll`
--

DROP TABLE IF EXISTS `payroll`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `month_year` varchar(20) DEFAULT NULL,
  `salary_rate` decimal(10,2) DEFAULT '0.00',
  `total_hours` decimal(10,2) DEFAULT '0.00',
  `total_earnings` decimal(10,2) DEFAULT '0.00',
  `status` enum('paid','pending') DEFAULT 'pending',
  `gross_pay` decimal(10,2) DEFAULT '0.00',
  `tax_deduction` decimal(10,2) DEFAULT '0.00',
  `net_pay` decimal(10,2) DEFAULT '0.00',
  `overtime_hours` decimal(10,2) DEFAULT '0.00',
  `overtime_pay` decimal(10,2) DEFAULT '0.00',
  `transport_allowance` decimal(10,2) DEFAULT '0.00',
  `meal_allowance` decimal(10,2) DEFAULT '0.00',
  `housing_allowance` decimal(10,2) DEFAULT '0.00',
  `sss_deduction` decimal(10,2) DEFAULT '0.00',
  `philhealth_deduction` decimal(10,2) DEFAULT '0.00',
  `pagibig_deduction` decimal(10,2) DEFAULT '0.00',
  `loan_deduction` decimal(10,2) DEFAULT '0.00',
  `other_deduction` decimal(10,2) DEFAULT '0.00',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `payroll_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=23 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payroll`
--

LOCK TABLES `payroll` WRITE;
/*!40000 ALTER TABLE `payroll` DISABLE KEYS */;
INSERT INTO `payroll` VALUES (1,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(2,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(3,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(4,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(5,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(6,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(7,NULL,'May 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(9,5,'March 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(10,6,'March 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(14,5,'May 2025',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(15,6,'May 2025',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(19,5,'May 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(20,6,'May 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00);
/*!40000 ALTER TABLE `payroll` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payroll_access_logs`
--

DROP TABLE IF EXISTS `payroll_access_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_access_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `email` varchar(100) NOT NULL,
  `accessed_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `payroll_access_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payroll_access_logs`
--

LOCK TABLES `payroll_access_logs` WRITE;
/*!40000 ALTER TABLE `payroll_access_logs` DISABLE KEYS */;
INSERT INTO `payroll_access_logs` VALUES (1,9,'yapkimjean@gmail.com','2026-05-05 12:48:05'),(2,9,'yapkimjean@gmail.com','2026-05-05 12:48:32'),(3,9,'yapkimjean@gmail.com','2026-05-05 12:51:04'),(4,9,'yapkimjean@gmail.com','2026-05-05 14:04:47'),(5,9,'yapkimjean@gmail.com','2026-05-05 14:45:09'),(6,9,'yapkimjean@gmail.com','2026-05-05 15:26:54'),(7,9,'yapkimjean@gmail.com','2026-05-05 15:40:02'),(8,9,'yapkimjean@gmail.com','2026-05-05 16:13:01'),(9,9,'yapkimjean@gmail.com','2026-05-05 18:52:16'),(10,9,'yapkimjean@gmail.com','2026-05-06 03:08:10'),(11,9,'yapkimjean@gmail.com','2026-05-06 04:57:19'),(12,9,'yapkimjean@gmail.com','2026-05-06 04:58:27'),(13,15,'daennylyn@gmail.com','2026-05-10 12:13:59'),(14,15,'daennylyn@gmail.com','2026-05-10 12:52:12'),(15,15,'daennylyn@gmail.com','2026-05-10 13:02:41'),(16,15,'daennylyn@gmail.com','2026-05-10 13:09:09'),(17,15,'daennylyn@gmail.com','2026-05-10 13:09:20'),(18,15,'daennylyn@gmail.com','2026-05-12 11:21:39'),(19,15,'daennylyn@gmail.com','2026-05-12 13:03:52'),(20,15,'daennylyn@gmail.com','2026-05-12 14:46:30'),(21,15,'daennylyn@gmail.com','2026-05-14 12:45:02');
/*!40000 ALTER TABLE `payroll_access_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `performance_evaluations`
--

DROP TABLE IF EXISTS `performance_evaluations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `performance_evaluations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(50) NOT NULL,
  `evaluator_id` int NOT NULL,
  `type` enum('student_feedback','peer_review','supervisor_assessment') DEFAULT NULL,
  `rating` decimal(3,2) DEFAULT NULL,
  `comments` text,
  `evaluation_date` date DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `employee_id` (`employee_id`),
  KEY `evaluator_id` (`evaluator_id`),
  CONSTRAINT `performance_evaluations_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `users` (`employee_id`) ON DELETE CASCADE,
  CONSTRAINT `performance_evaluations_ibfk_2` FOREIGN KEY (`evaluator_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `performance_evaluations`
--

LOCK TABLES `performance_evaluations` WRITE;
/*!40000 ALTER TABLE `performance_evaluations` DISABLE KEYS */;
/*!40000 ALTER TABLE `performance_evaluations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schedule_change_requests`
--

DROP TABLE IF EXISTS `schedule_change_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schedule_change_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(50) NOT NULL,
  `full_name` varchar(255) DEFAULT NULL,
  `request_type` enum('new','change') NOT NULL,
  `date` date NOT NULL,
  `place` varchar(255) DEFAULT NULL,
  `course` varchar(255) DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `reason` text,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `admin_remarks` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `schedule_change_requests_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedule_change_requests`
--

LOCK TABLES `schedule_change_requests` WRITE;
/*!40000 ALTER TABLE `schedule_change_requests` DISABLE KEYS */;
INSERT INTO `schedule_change_requests` VALUES (1,'E006','Dr. John Lloyd T. Danzalan','new','2026-05-14','dssf','dfAfa','08:00:00','17:00:00','adfaf','approved',NULL,'2026-05-12 15:29:37'),(2,'E006','Dr. John Lloyd T. Danzalan','change','2026-05-14','dssf','dfAfaasaasa','08:00:00','17:00:00','adfaf','rejected',NULL,'2026-05-12 15:39:36'),(3,'E006','Dr. John Lloyd T. Danzalan','change','2026-05-14','dssf','dfAfaasaasaaaa','08:00:00','17:00:00','adfaf','rejected','adaddaaaa','2026-05-12 15:43:56');
/*!40000 ALTER TABLE `schedule_change_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schedules`
--

DROP TABLE IF EXISTS `schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schedules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` varchar(50) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `place` varchar(255) DEFAULT NULL,
  `course` varchar(255) DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Scheduled',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedules`
--

LOCK TABLES `schedules` WRITE;
/*!40000 ALTER TABLE `schedules` DISABLE KEYS */;
INSERT INTO `schedules` VALUES (2,'E002','2026-04-07','Room 331','Healthcare101','19:00:00','20:00:00','Scheduled'),(3,'E002','2026-04-13','Room 331','Healthcare101','08:00:00','17:00:00','Scheduled'),(5,'E002','2026-05-01','National University - Manila','Healthcare101','15:00:00','17:00:00','Scheduled'),(11,'E002','2026-05-02','S Residence Tower 3','BSIT','22:33:00','22:50:00','Scheduled'),(13,'E007','2026-05-02','Sun Residence Tower 1','BSIT','22:33:00','22:40:00','Scheduled'),(14,'E002','2026-05-08','HCT Academy Pasig','BSIT','08:00:00','09:00:00','Scheduled'),(15,'E007','2026-05-08','National University - Manila','Healthcare101','08:00:00','17:00:00','Scheduled'),(16,'E002','2026-05-11','HCT Academy Pasig','Allied Health 2','08:00:00','17:00:00','Scheduled'),(17,'E002','2026-05-12','Colegio de San Agustin - Bacolod','Healthcare101','08:00:00','17:00:00','Scheduled'),(18,'E002','2026-05-06','S Residence Tower 3','Healthcare101','03:32:00','04:00:00','Scheduled'),(19,'E009','2026-05-06','S Residence Tower 3','Healthcare101','03:34:00','04:00:00','Scheduled'),(20,'E006','2026-05-06','National University - MOA','Healthcare101','13:14:00','14:00:00','Scheduled');
/*!40000 ALTER TABLE `schedules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `school_locations`
--

DROP TABLE IF EXISTS `school_locations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `school_locations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `latitude` decimal(10,7) NOT NULL DEFAULT '0.0000000',
  `longitude` decimal(10,7) NOT NULL DEFAULT '0.0000000',
  `radius` int NOT NULL DEFAULT '200',
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `school_locations`
--

LOCK TABLES `school_locations` WRITE;
/*!40000 ALTER TABLE `school_locations` DISABLE KEYS */;
INSERT INTO `school_locations` VALUES (1,'HCT Academy Pasig',14.5747800,121.0607000,200),(2,'National University - Manila',14.6042947,120.9942832,200),(3,'Olivarez College Paranaque',14.4788410,120.9963350,200),(4,'Wesleyan University Philippines',15.4844880,120.9760450,200),(5,'Colegio de San Agustin - Bacolod',10.6626200,122.9764100,200),(6,'S Residence Tower 3',14.5334600,120.9880800,150),(7,'Sun Residence Tower 1',14.6182800,121.0005900,150),(8,'National University - MOA',14.5305700,120.9811000,200);
/*!40000 ALTER TABLE `school_locations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_chat_read`
--

DROP TABLE IF EXISTS `user_chat_read`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_chat_read` (
  `user_id` int NOT NULL,
  `room_id` int NOT NULL,
  `last_read_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`,`room_id`),
  KEY `room_id` (`room_id`),
  CONSTRAINT `user_chat_read_ibfk_1` FOREIGN KEY (`room_id`) REFERENCES `chat_rooms` (`id`) ON DELETE CASCADE,
  CONSTRAINT `user_chat_read_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_chat_read`
--

LOCK TABLES `user_chat_read` WRITE;
/*!40000 ALTER TABLE `user_chat_read` DISABLE KEYS */;
INSERT INTO `user_chat_read` VALUES (6,9,'2026-05-10 16:37:32'),(6,10,'2026-05-12 15:30:30'),(9,7,'2026-05-14 13:31:30'),(9,9,'2026-05-14 13:31:30'),(15,7,'2026-05-12 15:34:06'),(15,9,'2026-05-12 15:34:06'),(15,10,'2026-05-12 15:34:06'),(17,9,'2026-05-12 11:37:20');
/*!40000 ALTER TABLE `user_chat_read` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(20) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `role` varchar(50) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `password_last_changed` date DEFAULT (curdate()),
  `employment_type` enum('Full-time','Part-time','Provisionary') DEFAULT 'Full-time',
  `position_level` enum('Entry Level Simulationist','Senior Simulationist') DEFAULT 'Entry Level Simulationist',
  `contract_type` varchar(50) DEFAULT 'Regular',
  `monthly_salary` decimal(10,2) DEFAULT '30000.00',
  `work_days_per_month` int DEFAULT '22',
  `payroll_pin` varchar(6) DEFAULT '1234',
  `payroll_access` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_id` (`employee_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=18 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'ADM01','System Admin','admin@email.com','admin123','admin','deactivated','2026-02-10 13:01:42','2026-04-07','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0),(5,'E003','Dr. Maui S. Torres','mawie@gmail.com','emp1234','instructor','deactivated','2026-02-11 05:36:44','2026-04-07','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0),(6,'E006','Dr. John Lloyd T. Danzalan','danzi9012004@gmail.com','emp1234','instructor','active','2026-02-11 12:42:52','2026-05-11','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0),(9,'ADM02','Admin Kim','yapkimjean@gmail.com','admin123','admin','active','2026-05-04 14:57:24','2026-05-04','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0),(15,'E007','Alliah','daennylyn@gmail.com','emp007','hr_admin','active','2026-05-10 12:03:47','2026-05-10','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',1),(17,'E008','Kate','ykean119@gmail.com','emp008','security','active','2026-05-10 12:18:55','2026-05-10','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `visitor_history`
--

DROP TABLE IF EXISTS `visitor_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitor_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `visitor_id` varchar(50) NOT NULL,
  `visitor_name` varchar(255) DEFAULT NULL,
  `ble_id` varchar(50) DEFAULT NULL,
  `floor` varchar(10) DEFAULT NULL,
  `x` decimal(5,2) DEFAULT NULL,
  `y` decimal(5,2) DEFAULT NULL,
  `event_type` enum('enter','move','exit') DEFAULT 'move',
  `timestamp` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visitor_history`
--

LOCK TABLES `visitor_history` WRITE;
/*!40000 ALTER TABLE `visitor_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `visitor_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `visitor_requests`
--

DROP TABLE IF EXISTS `visitor_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visitor_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `first_name` varchar(255) NOT NULL,
  `last_name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `visit_date` date NOT NULL,
  `visit_time` time NOT NULL,
  `reason` text NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','RESCHEDULED') DEFAULT 'PENDING',
  `admin_notes` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_by` int DEFAULT NULL,
  `processed_at` timestamp NULL DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `ble_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_admin_processor` (`processed_by`),
  CONSTRAINT `fk_admin_processor` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `visitor_requests_ibfk_1` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visitor_requests`
--

LOCK TABLES `visitor_requests` WRITE;
/*!40000 ALTER TABLE `visitor_requests` DISABLE KEYS */;
INSERT INTO `visitor_requests` VALUES (1,'Kim Jean','Yap','yapkimjean@gmail.com','2026-04-08','10:00:00','Meeting with dr.','APPROVED','We look forward to seeing you at HCT Academy!','2026-04-06 14:56:32',NULL,NULL,NULL,NULL),(2,'Tes','Data','daennylyn@gmail.com','2026-04-10','11:00:00','Meeting','APPROVED','We look forward to seeing you at HCT Academy!','2026-04-06 15:30:03',NULL,NULL,NULL,NULL),(3,'Test again','Data','daennylyn@gmail.com','2026-04-16','08:00:00','MEETING WITH NUSRSE','APPROVED',NULL,'2026-04-06 15:36:02',NULL,NULL,NULL,NULL),(4,'Test again','Data','daennylyn@gmail.com','2026-04-15','11:46:00','MEETING','REJECTED','Sorry, we have a schedule conflict.','2026-04-06 15:38:53',NULL,NULL,NULL,NULL),(5,'Test ','Data','daennylyn@gmail.com','2026-04-13','14:40:00','meeting','APPROVED',NULL,'2026-04-06 15:39:52',NULL,NULL,NULL,NULL),(6,'Test again','Data','daennylyn@gmail.com','2026-04-21','12:03:00','meeting','APPROVED','','2026-04-06 16:04:06',1,'2026-04-06 16:18:08',NULL,NULL),(7,'Kim Jean','Yap','yapkimjean@gmail.com','2026-05-12','10:00:00','Meeting ','APPROVED','','2026-04-30 16:11:15',1,'2026-04-30 16:16:56',NULL,NULL),(8,'Kim Jean','Yap','yapkimjean@gmail.com','2026-05-14','09:00:00','Meeting','REJECTED','Schedule conflict.','2026-04-30 16:14:29',1,'2026-04-30 16:18:04',NULL,NULL),(9,'Kim Jean','Yap','yapkimjean@gmail.com','2026-05-15','16:00:00','Meeting','APPROVED',NULL,'2026-04-30 16:21:00',1,'2026-04-30 16:41:28',NULL,NULL),(10,'Kim Jean','Yap','yapkimjean@gmail.com','2026-05-15','05:41:00','meeting','REJECTED','Because of schedule','2026-04-30 16:41:46',1,'2026-04-30 16:42:45',NULL,NULL),(11,'Kim Jean','Yap','yapkimjean@gmail.com','2026-05-15','05:41:00','meeting','APPROVED',NULL,'2026-04-30 16:41:50',1,'2026-04-30 16:43:09',NULL,NULL),(12,'Kim','Jean','yapkimjean@gmail.com','2026-05-09','11:00:00','Meeting','APPROVED',NULL,'2026-04-30 18:02:56',1,'2026-04-30 18:05:32','09469738712',NULL),(13,'Kim','Jean','yapkimjean@gmail.com','2026-05-12','09:00:00','Meeting','APPROVED',NULL,'2026-05-01 09:43:31',1,'2026-05-01 09:43:56','09469738712',NULL),(14,'Kim','Jean','yapkimjean@gmail.com','2026-05-07','10:53:00','meeting','APPROVED',NULL,'2026-05-04 23:54:01',9,'2026-05-05 00:00:56','09469738712',NULL),(15,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-08','09:00:00','Meetinng with President','APPROVED',NULL,'2026-05-05 18:46:42',9,'2026-05-05 18:47:59','09469738712','BLE-3F-A1'),(16,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-14','08:41:00','fadfadfad','PENDING',NULL,'2026-05-12 10:41:53',NULL,NULL,'09469738712','BLE-3F-A3');
/*!40000 ALTER TABLE `visitor_requests` ENABLE KEYS */;
UNLOCK TABLES;
SET @@SESSION.SQL_LOG_BIN = @MYSQLDUMP_TEMP_LOG_BIN;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-14 23:42:54

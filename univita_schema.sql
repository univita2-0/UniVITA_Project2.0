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
) ENGINE=InnoDB AUTO_INCREMENT=14 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alert_receipts`
--

LOCK TABLES `alert_receipts` WRITE;
/*!40000 ALTER TABLE `alert_receipts` DISABLE KEYS */;
INSERT INTO `alert_receipts` VALUES (1,3,6,'2026-05-13 14:47:04'),(2,4,6,'2026-05-15 03:46:09'),(3,5,6,'2026-05-19 02:53:58'),(4,5,9,NULL),(5,5,15,NULL),(6,5,17,NULL),(7,6,6,'2026-05-19 02:53:58'),(8,7,6,'2026-05-19 02:53:57'),(9,8,6,'2026-05-27 23:32:49'),(10,8,9,NULL),(11,8,15,NULL),(12,8,17,NULL),(13,8,25,NULL);
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
  `clock_in_selfie` varchar(500) DEFAULT NULL,
  `clock_out_selfie` varchar(500) DEFAULT NULL,
  `clock_in_biometric_verified` tinyint(1) DEFAULT '0',
  `clock_out_biometric_verified` tinyint(1) DEFAULT '0',
  `clock_in_latitude` decimal(10,8) DEFAULT NULL,
  `clock_in_longitude` decimal(11,8) DEFAULT NULL,
  `clock_out_latitude` decimal(10,8) DEFAULT NULL,
  `clock_out_longitude` decimal(11,8) DEFAULT NULL,
  `correction_requested` tinyint(1) DEFAULT '0',
  `correction_status` enum('pending','approved','rejected') DEFAULT NULL,
  `correction_reason` text,
  `schedule_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_attendance_schedule` (`schedule_id`),
  CONSTRAINT `fk_attendance_schedule` FOREIGN KEY (`schedule_id`) REFERENCES `schedules` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB AUTO_INCREMENT=31 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance`
--

LOCK TABLES `attendance` WRITE;
/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
INSERT INTO `attendance` VALUES (1,'E002','2026-04-07','19:16:24','20:00:41','present','G2Q2+388, Pasay City',0.00,NULL,NULL,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,2),(2,'E002','2026-04-14',NULL,NULL,'on leave','Remote/Leave',0.00,NULL,NULL,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL),(3,'E002','2026-04-17',NULL,NULL,'on leave','Remote/Leave',0.00,NULL,NULL,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL),(4,'E002','2026-05-05',NULL,NULL,'on leave','Remote/Leave',0.00,NULL,NULL,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL),(5,'E002','2026-05-01','15:00:00','17:00:00','present','Appeal Approved',2.00,NULL,NULL,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,5),(9,'E002','2026-05-02','20:33:25','22:22:09','late','Pearl Drive, Pasay City',0.00,NULL,NULL,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,11),(10,'E007','2026-05-02','22:33:41','22:41:21','late','España Boulevard, Quezon City',0.00,NULL,NULL,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,13),(11,'E002','2026-05-06',NULL,'10:15:21','on leave','Tower 3, S Residences, Lot 2, Barangay 76, Zone 10, Central Business Park 1-A, 1300, Pasay City',0.00,NULL,NULL,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,18),(12,'E009','2026-05-06','03:34:06','10:15:08','late','Tower 3, S Residences, Lot 2, Barangay 76, Zone 10, Central Business Park 1-A, 1300, Pasay City',0.00,NULL,NULL,0,0,NULL,NULL,NULL,NULL,0,NULL,NULL,19),(19,'E006','2026-05-21','03:28:27','06:41:12','present','S Residence Tower 3 (14.532808, 120.988625)',3.21,NULL,'/uploads/selfies/1779316872267-55061367.jpg',0,0,14.53280800,120.98862450,14.53290850,120.98822980,0,NULL,NULL,37),(21,'E006','2026-05-21','10:51:13','16:46:09','late','S Residence Tower 3',0.00,'/uploads/selfies/1779331872860-896301443.jpg','/uploads/selfies/1779353062996-671930565.jpg',0,0,14.53295340,120.98822400,14.53312340,120.98787920,0,NULL,NULL,38),(22,'E006','2026-05-25','18:50:05',NULL,'present','S Residence Tower 3 (14.532924, 120.988223)',0.00,'/uploads/selfies/1779706205161-349739277.jpg',NULL,0,0,14.53292370,120.98822250,NULL,NULL,0,NULL,NULL,40),(23,'E006','2026-05-28','07:33:01','08:00:28','present','S Residence Tower 3',0.00,'/uploads/selfies/1779924781428-187570837.jpg','/uploads/selfies/1779926428000-70275360.jpg',0,0,14.53291010,120.98818260,14.53297140,120.98820530,0,NULL,NULL,43),(24,'E006','2026-05-28','08:10:56',NULL,'present','S Residence Tower 3 (14.532970, 120.988190)',0.00,'/uploads/selfies/1779927056751-587050525.jpg',NULL,0,0,14.53297050,120.98819010,NULL,NULL,0,NULL,NULL,44),(25,'E006','2026-05-28','08:36:13','09:05:44','present','S Residence Tower 3',0.00,'/uploads/selfies/1779928573660-740540065.jpg','/uploads/selfies/1779930344786-815911052.jpg',0,0,14.53295460,120.98822070,14.53302790,120.98829200,0,NULL,NULL,45),(26,'E006','2026-05-28','09:07:16','09:56:42','present','S Residence Tower 3',0.00,'/uploads/selfies/1779930434862-316314220.jpg','/uploads/selfies/1779933401983-725992534.jpg',0,0,14.53295240,120.98821890,14.53291870,120.98822360,0,NULL,NULL,46),(27,'E006','2026-05-28','09:57:45',NULL,'present','S Residence Tower 3 (14.532945, 120.988197)',0.00,'/uploads/selfies/1779933464948-831506198.jpg',NULL,0,0,14.53294520,120.98819660,NULL,NULL,0,NULL,NULL,47),(28,'E006','2026-05-28','10:41:48',NULL,'present','S Residence Tower 3 (14.532913, 120.988191)',0.00,'/uploads/selfies/1779936080978-974400083.jpg',NULL,0,0,14.53291270,120.98819080,NULL,NULL,0,NULL,NULL,48),(29,'E006','2026-05-28','11:12:44',NULL,'present','S Residence Tower 3 (14.532955, 120.988206)',0.00,'/uploads/selfies/1779937963122-366304892.jpg',NULL,0,0,14.53295470,120.98820610,NULL,NULL,0,NULL,NULL,49),(30,'E006','2026-05-28','12:04:05',NULL,'present','S Residence Tower 3 (14.532942, 120.988233)',0.00,'/uploads/selfies/1779941045813-272374483.jpg',NULL,0,0,14.53294210,120.98823320,NULL,NULL,0,NULL,NULL,50);
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
  `requested_time_in` time DEFAULT NULL,
  `requested_time_out` time DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `attendance_appeals_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`employee_id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_appeals`
--

LOCK TABLES `attendance_appeals` WRITE;
/*!40000 ALTER TABLE `attendance_appeals` DISABLE KEYS */;
INSERT INTO `attendance_appeals` VALUES (6,'E006','2026-05-28','Jsjsjs',NULL,'rejected',NULL,'2026-05-27 13:08:59',NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `attendance_appeals` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_corrections`
--

DROP TABLE IF EXISTS `attendance_corrections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_corrections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `attendance_date` date NOT NULL,
  `requested_clock_in` time DEFAULT NULL,
  `requested_clock_out` time DEFAULT NULL,
  `reason` text NOT NULL,
  `selfie_url` varchar(500) DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `reviewed_by` int DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `reviewed_by` (`reviewed_by`),
  CONSTRAINT `attendance_corrections_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`),
  CONSTRAINT `attendance_corrections_ibfk_2` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_corrections`
--

LOCK TABLES `attendance_corrections` WRITE;
/*!40000 ALTER TABLE `attendance_corrections` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_corrections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_logs`
--

DROP TABLE IF EXISTS `audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `target_type` varchar(50) DEFAULT NULL,
  `target_id` varchar(50) DEFAULT NULL,
  `old_value` json DEFAULT NULL,
  `new_value` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_action` (`user_id`,`action`),
  KEY `idx_created` (`created_at`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=171 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_logs`
--

LOCK TABLES `audit_logs` WRITE;
/*!40000 ALTER TABLE `audit_logs` DISABLE KEYS */;
INSERT INTO `audit_logs` VALUES (1,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-25 08:46:19'),(2,9,'REJECT_LEAVE','leave_request','16',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-25 08:53:14'),(3,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-25 08:55:18'),(4,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-25 09:07:30'),(5,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-25 09:13:21'),(6,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-25 10:44:13'),(7,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 08:14:01'),(8,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 08:22:04'),(9,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 08:57:31'),(10,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 09:00:27'),(11,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 09:00:44'),(12,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 09:22:03'),(13,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 09:42:06'),(14,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 10:21:18'),(15,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 10:23:31'),(16,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 10:28:04'),(17,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 10:28:51'),(18,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 12:26:29'),(19,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 12:28:05'),(20,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 13:06:43'),(21,9,'REJECT_APPEAL','attendance_appeal','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 13:33:49'),(22,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 13:51:38'),(23,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 13:52:12'),(24,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 13:54:28'),(25,9,'DELETE_COURSE','course','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 14:01:10'),(26,9,'DELETE_COURSE','course','7',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 14:21:32'),(27,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 14:59:54'),(28,15,'RUN_MONTHLY_PAYROLL','payroll',NULL,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 15:02:16'),(29,15,'RUN_MONTHLY_PAYROLL','payroll',NULL,NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 15:09:10'),(30,15,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 15:19:55'),(31,15,'UPDATE_EMPLOYEE','user','25',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 15:30:03'),(32,15,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 15:31:06'),(33,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 15:35:12'),(34,15,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 15:36:33'),(35,15,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 15:39:59'),(36,15,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 15:45:48'),(37,15,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:00:21'),(38,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:02:23'),(39,9,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:03:49'),(40,9,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:04:55'),(41,9,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:05:07'),(42,9,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:19:14'),(43,9,'UPDATE_EMPLOYEE','user','6',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:19:26'),(44,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:19:42'),(45,15,'DELETE_JOB','job_posting','2',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:20:42'),(46,15,'CREATE_JOB','job_posting','4',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:20:57'),(47,15,'UPDATE_JOB','job_posting','4',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:21:10'),(48,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:30:45'),(49,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:31:27'),(50,15,'UPDATE_JOB','job_posting','4',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:34:25'),(51,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:45:09'),(52,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:55:53'),(53,9,'APPROVE_APPOINTMENT','visitor_request','44',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:56:30'),(54,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:56:56'),(55,17,'VISITOR_ARRIVE','visitor_request','44',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:57:35'),(56,17,'VISITOR_RETURN','visitor_request','44',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:59:06'),(57,17,'APPROVE_APPOINTMENT','visitor_request','45',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 16:59:57'),(58,17,'VISITOR_ARRIVE','visitor_request','45',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:00:31'),(59,17,'VISITOR_RETURN','visitor_request','45',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:20:14'),(60,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:20:40'),(61,9,'APPROVE_APPOINTMENT','visitor_request','46',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:20:49'),(62,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:21:09'),(63,17,'VISITOR_ARRIVE','visitor_request','46',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:21:24'),(64,17,'VISITOR_RETURN','visitor_request','46',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:28:41'),(65,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:29:06'),(66,9,'APPROVE_APPOINTMENT','visitor_request','47',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:29:15'),(67,17,'VISITOR_ARRIVE','visitor_request','47',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:29:28'),(68,17,'VISITOR_RETURN','visitor_request','47',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:32:41'),(69,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:33:59'),(70,9,'APPROVE_APPOINTMENT','visitor_request','48',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:34:08'),(71,17,'VISITOR_ARRIVE','visitor_request','48',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:34:21'),(72,17,'VISITOR_RETURN','visitor_request','48',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:36:32'),(73,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:37:02'),(74,9,'APPROVE_APPOINTMENT','visitor_request','49',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:37:11'),(75,17,'VISITOR_ARRIVE','visitor_request','49',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:37:22'),(76,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:41:15'),(77,9,'APPROVE_APPOINTMENT','visitor_request','50',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:41:22'),(78,17,'VISITOR_ARRIVE','visitor_request','50',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:41:33'),(79,17,'VISITOR_RETURN','visitor_request','50',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:43:41'),(80,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:45:52'),(81,9,'APPROVE_APPOINTMENT','visitor_request','51',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:45:59'),(82,17,'VISITOR_ARRIVE','visitor_request','51',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:46:10'),(83,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:51:13'),(84,9,'APPROVE_APPOINTMENT','visitor_request','52',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:51:20'),(85,17,'VISITOR_ARRIVE','visitor_request','52',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:51:35'),(86,17,'VISITOR_RETURN','visitor_request','52',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:55:25'),(87,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:55:52'),(88,9,'APPROVE_APPOINTMENT','visitor_request','53',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:56:00'),(89,17,'VISITOR_ARRIVE','visitor_request','53',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 17:57:12'),(90,17,'VISITOR_RETURN','visitor_request','53',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:02:42'),(91,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:03:06'),(92,9,'APPROVE_APPOINTMENT','visitor_request','54',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:03:18'),(93,17,'VISITOR_ARRIVE','visitor_request','54',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:03:29'),(94,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:07:36'),(95,9,'APPROVE_APPOINTMENT','visitor_request','55',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:07:44'),(96,17,'VISITOR_ARRIVE','visitor_request','55',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:07:57'),(97,17,'VISITOR_RETURN','visitor_request','55',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:15:05'),(98,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:15:46'),(99,9,'APPROVE_APPOINTMENT','visitor_request','56',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:15:54'),(100,17,'VISITOR_ARRIVE','visitor_request','56',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:16:05'),(101,17,'VISITOR_RETURN','visitor_request','56',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:17:37'),(102,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:26:52'),(103,9,'APPROVE_APPOINTMENT','visitor_request','57',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:27:00'),(104,17,'VISITOR_ARRIVE','visitor_request','57',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:27:11'),(105,17,'VISITOR_RETURN','visitor_request','57',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 18:33:28'),(106,9,'CREATE_SCHEDULE','schedule','43',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 23:28:52'),(107,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 23:32:21'),(108,6,'CLOCK_IN','attendance','23',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 23:33:01'),(109,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 23:39:09'),(110,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-27 23:58:10'),(111,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-27 23:58:48'),(112,6,'CLOCK_OUT','attendance','23',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 00:00:28'),(113,9,'CREATE_SCHEDULE','schedule','44',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 00:01:12'),(114,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 00:10:28'),(115,6,'CLOCK_IN','attendance','24',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 00:10:56'),(116,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 00:20:02'),(117,9,'CREATE_SCHEDULE','schedule','45',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 00:35:39'),(118,6,'CLOCK_IN','attendance','25',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 00:36:13'),(119,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 01:05:18'),(120,6,'CLOCK_OUT','attendance','25',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 01:05:44'),(121,9,'CREATE_SCHEDULE','schedule','46',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 01:06:33'),(122,6,'CLOCK_IN','attendance','26',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 01:07:16'),(123,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 01:56:19'),(124,6,'CLOCK_OUT','attendance','26',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 01:56:42'),(125,9,'CREATE_SCHEDULE','schedule','47',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 01:57:16'),(126,6,'CLOCK_IN','attendance','27',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 01:57:45'),(127,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 01:58:11'),(128,6,'LOGIN','user','6',NULL,NULL,'175.176.43.152','okhttp/4.12.0','2026-05-28 02:38:30'),(129,9,'CREATE_SCHEDULE','schedule','48',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 02:39:38'),(130,6,'CLOCK_IN','attendance','28',NULL,NULL,'175.176.43.152','okhttp/4.12.0','2026-05-28 02:41:48'),(131,6,'LOGIN','user','6',NULL,NULL,'175.176.43.152','okhttp/4.12.0','2026-05-28 02:49:00'),(132,6,'LOGIN','user','6',NULL,NULL,'175.176.43.152','okhttp/4.12.0','2026-05-28 02:49:39'),(133,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 02:57:33'),(134,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 03:00:34'),(135,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 03:07:24'),(136,9,'CREATE_SCHEDULE','schedule','49',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 03:09:39'),(137,6,'CLOCK_IN','attendance','29',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 03:12:44'),(138,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 03:14:02'),(139,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 03:23:27'),(140,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 03:25:06'),(141,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 03:37:59'),(142,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 03:44:50'),(143,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 04:02:01'),(144,9,'CREATE_SCHEDULE','schedule','50',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 04:03:11'),(145,6,'CLOCK_IN','attendance','30',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 04:04:05'),(146,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 04:18:18'),(147,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 04:19:20'),(148,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-28 04:38:46'),(149,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 04:44:51'),(150,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 04:45:28'),(151,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-28 04:49:21'),(152,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-29 04:24:30'),(153,9,'APPROVE_APPOINTMENT','visitor_request','58',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-29 04:25:36'),(154,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-29 04:26:24'),(155,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-29 04:27:14'),(156,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-31 13:19:06'),(157,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-31 13:19:40'),(158,15,'LOGIN','user','15',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-31 13:23:16'),(159,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-05-31 13:24:36'),(160,6,'LOGIN','user','6',NULL,NULL,'38.77.153.12','okhttp/4.12.0','2026-05-31 13:27:55'),(161,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-06-03 08:59:05'),(162,9,'APPROVE_APPOINTMENT','visitor_request','59',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-06-03 08:59:55'),(163,17,'VISITOR_ARRIVE','visitor_request','59',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-06-03 09:00:53'),(164,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-06-03 09:04:32'),(165,17,'VISITOR_RETURN','visitor_request','59',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-06-03 09:24:40'),(166,9,'LOGIN','user','9',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-06-03 09:25:44'),(167,9,'APPROVE_APPOINTMENT','visitor_request','60',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-06-03 09:26:04'),(168,9,'APPROVE_APPOINTMENT','visitor_request','60',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-06-03 09:26:07'),(169,17,'LOGIN','user','17',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-06-03 09:26:40'),(170,17,'VISITOR_ARRIVE','visitor_request','60',NULL,NULL,'127.0.0.1','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36 Edg/148.0.0.0','2026-06-03 09:27:08');
/*!40000 ALTER TABLE `audit_logs` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ble_tags`
--

LOCK TABLES `ble_tags` WRITE;
/*!40000 ALTER TABLE `ble_tags` DISABLE KEYS */;
INSERT INTO `ble_tags` VALUES (7,'ESP 32-Badge2','Beacon 2','30:76:f5:e8:da:02'),(8,'ESP32-Badge1','Beacon 1','b0:cb:d8:e9:80:62');
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
INSERT INTO `chat_messages` VALUES (2,7,9,'hi','2026-05-10 13:27:05'),(3,7,15,'hello','2026-05-10 13:32:39'),(5,7,9,'hello','2026-05-10 13:59:40'),(6,7,15,'hi','2026-05-10 14:06:08'),(7,7,9,'hello','2026-05-10 14:11:45'),(8,7,9,'hi','2026-05-10 14:17:37'),(9,9,15,'hi','2026-05-10 15:11:43');
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
INSERT INTO `chat_rooms` VALUES (1,'General','group','2026-05-08 05:04:08'),(2,'Security','group','2026-05-08 05:04:08'),(3,'HR','group','2026-05-08 05:04:08'),(4,'Academics','group','2026-05-08 05:04:08'),(7,'dm_9_15','direct','2026-05-10 13:27:03'),(9,'TEAM X0','group','2026-05-10 15:11:40');
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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `emergency_alerts`
--

LOCK TABLES `emergency_alerts` WRITE;
/*!40000 ALTER TABLE `emergency_alerts` DISABLE KEYS */;
INSERT INTO `emergency_alerts` VALUES (1,'Typhoon','No work','warning','[\"instructor\"]','2026-05-13 14:24:10',NULL,1),(2,'fgjf','jhkururu','info','[\"instructor\"]','2026-05-13 14:24:39',NULL,1),(3,'zsgfgfd','fvszsf','info','[\"instructor\"]','2026-05-13 14:35:40',NULL,1),(4,'dghghs','bvsdfddbgbs','warning','[\"instructor\"]','2026-05-13 14:56:27',NULL,1),(5,'sdasdasdd','DFdfAFAF','info','[\"instructor\", \"admin\", \"security\", \"hr_admin\"]','2026-05-19 02:04:12',NULL,1),(6,'sddd','cAaDASD','warning','[\"instructor\"]','2026-05-19 02:06:29',NULL,1),(7,'fAfa','FdF','info','[\"instructor\"]','2026-05-19 02:08:35',NULL,1),(8,'zxsas','asassa','info','[\"instructor\", \"admin\", \"security\", \"hr_admin\"]','2026-05-27 14:10:58',NULL,1);
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
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
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
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
INSERT INTO `events` VALUES (7,'MMM','2026-05-08','LLLL','10:04:00','20:04:00','Meeting',''),(8,'Nutrition month','2026-05-15','Room 101','06:51:00','00:00:00','School Event',''),(9,'RE-ORAL','2026-05-19','NU-MOA','12:00:00','00:00:00','School Event',''),(10,'sfFF','2026-05-19','CcCSC','00:00:00','00:00:00','Meeting',''),(11,'sdsd','2026-05-21','scsd','00:00:00','00:00:00','Holiday','sdsds'),(12,'zxfXcc','2026-05-19','asdsd','00:00:00','00:00:00','Holiday','sad'),(13,'zxcc','2026-05-19','xccc','00:00:00','00:00:00','School Event','acacc'),(14,'mnbmj','2026-05-19','hmn','00:00:00','00:00:00','Note/Reminder','hj'),(15,'sddss','2026-05-19','sdsd','00:00:00','00:00:00','School Event','sds');
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `geofences`
--

DROP TABLE IF EXISTS `geofences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `geofences` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `radius_meters` int DEFAULT '200',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `geofences`
--

LOCK TABLES `geofences` WRITE;
/*!40000 ALTER TABLE `geofences` DISABLE KEYS */;
INSERT INTO `geofences` VALUES (1,'NU MOA',14.53057000,120.98110000,200),(2,'HCT Academy Pasig',14.57478000,121.06070000,200);
/*!40000 ALTER TABLE `geofences` ENABLE KEYS */;
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
-- Table structure for table `instructor_location_tracking`
--

DROP TABLE IF EXISTS `instructor_location_tracking`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `instructor_location_tracking` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(20) NOT NULL,
  `schedule_id` int DEFAULT NULL,
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `location_name` varchar(255) DEFAULT NULL,
  `is_inside_campus` tinyint(1) DEFAULT '1',
  `location_enabled` tinyint(1) DEFAULT '1',
  `alert_sent` tinyint(1) DEFAULT '0',
  `ping_time` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `employee_id` (`employee_id`,`ping_time`),
  KEY `idx_employee_ping` (`employee_id`,`ping_time`)
) ENGINE=InnoDB AUTO_INCREMENT=697 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `instructor_location_tracking`
--

LOCK TABLES `instructor_location_tracking` WRITE;
/*!40000 ALTER TABLE `instructor_location_tracking` DISABLE KEYS */;
INSERT INTO `instructor_location_tracking` VALUES (372,'E006',33,14.53290410,120.98820410,'S Residence Tower 3',1,1,0,'2026-05-22 05:08:52'),(374,'E006',33,14.53294430,120.98823360,'S Residence Tower 3',1,1,0,'2026-05-22 05:09:47'),(375,'E006',33,14.53294780,120.98820000,'S Residence Tower 3',1,1,0,'2026-05-22 05:10:08'),(378,'E006',33,14.53303970,120.98824530,'S Residence Tower 3',1,1,0,'2026-05-22 05:11:11'),(381,'E006',33,14.53294450,120.98820250,'S Residence Tower 3',1,1,0,'2026-05-22 05:12:13'),(384,'E006',33,14.53300930,120.98817100,'S Residence Tower 3',1,1,0,'2026-05-22 05:13:16'),(387,'E006',33,14.53310910,120.98833980,'S Residence Tower 3',1,1,0,'2026-05-22 05:14:35'),(389,'E006',33,14.53295100,120.98819990,'S Residence Tower 3',1,1,0,'2026-05-22 05:15:06'),(392,'E006',33,14.53301680,120.98823110,'S Residence Tower 3',1,1,0,'2026-05-22 05:16:06'),(395,'E006',33,14.53289350,120.98820110,'S Residence Tower 3',1,1,0,'2026-05-22 05:17:09'),(397,'E006',33,14.53293820,120.98820660,'S Residence Tower 3',1,1,0,'2026-05-22 05:18:18'),(400,'E006',33,14.53293080,120.98821470,'S Residence Tower 3',1,1,0,'2026-05-22 05:19:20'),(402,'E006',33,14.53313250,120.98820200,'S Residence Tower 3',1,1,0,'2026-05-22 05:20:16'),(404,'E006',33,14.53293710,120.98819910,'S Residence Tower 3',1,1,0,'2026-05-22 05:21:05'),(407,'E006',33,14.53291810,120.98834510,'S Residence Tower 3',1,1,0,'2026-05-22 05:22:40'),(409,'E006',33,14.53316440,120.98814600,'S Residence Tower 3',1,1,0,'2026-05-22 06:02:23'),(411,'E006',33,14.53295640,120.98824480,'S Residence Tower 3',1,1,0,'2026-05-22 06:03:03'),(414,'E006',33,14.53336710,120.98825660,'S Residence Tower 3',1,1,0,'2026-05-22 06:09:44'),(416,'E006',33,14.53328990,120.98831030,'S Residence Tower 3',1,1,0,'2026-05-22 06:10:06'),(418,'E006',33,14.53340630,120.98829170,'S Residence Tower 3',1,1,0,'2026-05-22 06:11:07'),(420,'E006',33,14.53309390,120.98830040,'S Residence Tower 3',1,1,0,'2026-05-22 06:15:36'),(422,'E006',33,14.53336030,120.98828080,'S Residence Tower 3',1,1,0,'2026-05-22 06:16:18'),(424,'E006',33,14.53313340,120.98828310,'S Residence Tower 3',1,1,0,'2026-05-22 06:17:04'),(427,'E006',33,14.53297770,120.98824780,'S Residence Tower 3',1,1,0,'2026-05-22 06:18:06'),(429,'E006',33,14.53292980,120.98830060,'S Residence Tower 3',1,1,0,'2026-05-22 06:30:04'),(432,'E006',33,14.53318520,120.98829090,'S Residence Tower 3',1,1,0,'2026-05-22 06:31:07'),(434,'E006',33,14.53299130,120.98823910,'S Residence Tower 3',1,1,0,'2026-05-22 06:32:05'),(437,'E006',33,14.53308760,120.98825090,'S Residence Tower 3',1,1,0,'2026-05-22 06:41:12'),(440,'E006',33,14.53294400,120.98822310,'S Residence Tower 3',1,1,0,'2026-05-22 06:42:15'),(443,'E006',33,14.53297740,120.98819340,'S Residence Tower 3',1,1,0,'2026-05-22 06:43:17'),(446,'E006',33,14.53291960,120.98822020,'S Residence Tower 3',1,1,0,'2026-05-22 06:50:18'),(448,'E006',33,14.53325450,120.98833010,'S Residence Tower 3',1,1,0,'2026-05-22 06:51:23'),(450,'E006',33,14.53329080,120.98832330,'S Residence Tower 3',1,1,0,'2026-05-22 06:52:05'),(453,'E006',33,14.53333950,120.98827330,'S Residence Tower 3',1,1,0,'2026-05-22 06:53:07'),(455,'E006',33,14.53325530,120.98831870,'S Residence Tower 3',1,1,0,'2026-05-22 07:03:35'),(457,'E006',33,14.53327300,120.98831140,'S Residence Tower 3',1,1,0,'2026-05-22 07:04:28'),(458,'E006',33,14.53303910,120.98820140,'S Residence Tower 3',1,1,0,'2026-05-22 07:05:07'),(460,'E006',33,14.53353170,120.98802810,'S Residence Tower 3',1,1,0,'2026-05-22 07:14:55'),(461,'E006',33,14.53555400,120.98494340,'S Residence Tower 3',0,1,0,'2026-05-22 07:17:18'),(462,'E006',33,14.53402890,120.98462130,'S Residence Tower 3',0,1,0,'2026-05-22 07:22:40'),(463,'E006',33,14.53330720,120.98828580,'S Residence Tower 3',1,1,0,'2026-05-22 07:23:14'),(465,'E006',33,14.53323360,120.98828940,'S Residence Tower 3',1,1,0,'2026-05-22 07:24:03'),(468,'E006',33,14.53315560,120.98832530,'S Residence Tower 3',1,1,0,'2026-05-22 07:25:05'),(471,'E006',33,14.53309580,120.98826770,'S Residence Tower 3',1,1,0,'2026-05-22 07:26:07'),(474,'E006',33,14.53304210,120.98827090,'S Residence Tower 3',1,1,0,'2026-05-22 07:27:10'),(477,'E006',33,14.53311790,120.98829360,'S Residence Tower 3',1,1,0,'2026-05-22 07:28:13'),(479,'E006',33,14.53306350,120.98827440,'S Residence Tower 3',1,1,0,'2026-05-22 07:29:10'),(481,'E006',33,14.53328030,120.98826800,'S Residence Tower 3',1,1,0,'2026-05-22 07:30:22'),(483,'E006',33,14.53315380,120.98831930,'S Residence Tower 3',1,1,0,'2026-05-22 07:31:12'),(485,'E006',33,14.53308930,120.98828560,'S Residence Tower 3',1,1,0,'2026-05-22 07:32:12'),(486,'E006',33,14.53319300,120.98823050,'S Residence Tower 3',1,1,0,'2026-05-22 07:37:27'),(488,'E006',33,14.53295440,120.98823180,'S Residence Tower 3',1,1,0,'2026-05-22 07:38:07'),(491,'E006',33,14.53335970,120.98821150,'S Residence Tower 3',1,1,0,'2026-05-22 07:39:27'),(493,'E006',33,14.53298460,120.98833830,'S Residence Tower 3',1,1,0,'2026-05-22 07:40:09'),(497,'E006',33,14.53294730,120.98832140,'S Residence Tower 3',1,1,0,'2026-05-22 07:41:13'),(499,'E006',33,14.53297720,120.98828690,'S Residence Tower 3',1,1,0,'2026-05-22 07:42:14'),(502,'E006',33,14.53331310,120.98830520,'S Residence Tower 3',1,1,0,'2026-05-22 07:43:26'),(504,'E006',33,14.53324170,120.98832940,'S Residence Tower 3',1,1,0,'2026-05-22 07:44:14'),(506,'E006',33,14.53329440,120.98835280,'S Residence Tower 3',1,1,0,'2026-05-22 07:45:14'),(508,'E006',33,14.53292160,120.98821400,'S Residence Tower 3',1,1,0,'2026-05-22 07:46:15'),(509,'E006',33,14.53296400,120.98823840,'S Residence Tower 3',1,1,0,'2026-05-22 07:47:06'),(512,'E006',33,14.53323250,120.98827290,'S Residence Tower 3',1,1,0,'2026-05-22 07:48:08'),(515,'E006',33,14.53294070,120.98821530,'S Residence Tower 3',1,1,0,'2026-05-22 07:51:32'),(516,'E006',33,14.53294070,120.98821530,'S Residence Tower 3',1,1,0,'2026-05-22 07:52:35'),(537,'E006',40,14.53292370,120.98822250,'S Residence Tower 3',1,1,0,'2026-05-25 10:50:05'),(540,'E006',40,14.53276870,120.98847420,'S Residence Tower 3',1,1,0,'2026-05-25 10:51:02'),(592,'E006',43,14.53292950,120.98823590,'S Residence Tower 3',1,1,0,'2026-05-27 23:31:36'),(621,'E006',43,14.53422370,120.98843340,'S Residence Tower 3',1,1,0,'2026-05-27 23:38:49'),(622,'E006',43,14.53345850,120.98834300,'S Residence Tower 3',1,1,0,'2026-05-27 23:46:19'),(623,'E006',43,14.53296140,120.98820640,'S Residence Tower 3',1,1,0,'2026-05-27 23:46:19'),(624,'E006',43,14.53295300,120.98820070,'S Residence Tower 3',1,1,0,'2026-05-27 23:46:19'),(625,'E006',43,0.00000000,0.00000000,'Unavailable',0,0,0,'2026-05-27 23:48:22'),(626,'E006',44,0.00000000,0.00000000,'Unavailable',0,0,0,'2026-05-28 00:14:39'),(627,'E006',48,14.53299720,120.98823970,'S Residence Tower 3',1,1,0,'2026-05-28 02:57:29'),(628,'E006',48,14.53297230,120.98819710,'S Residence Tower 3',1,1,0,'2026-05-28 02:57:30'),(629,'E006',48,14.53296780,120.98819510,'S Residence Tower 3',1,1,0,'2026-05-28 02:57:33'),(630,'E006',48,14.53296760,120.98818860,'S Residence Tower 3',1,1,0,'2026-05-28 02:57:38'),(631,'E006',48,14.53297280,120.98818390,'S Residence Tower 3',1,1,0,'2026-05-28 02:57:40'),(632,'E006',48,14.53291570,120.98820530,'S Residence Tower 3',1,1,0,'2026-05-28 02:58:01'),(633,'E006',48,14.53340690,120.98796570,'S Residence Tower 3',1,1,0,'2026-05-28 02:58:05'),(634,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:10:34'),(635,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:11:34'),(636,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:12:34'),(637,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:13:34'),(638,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:14:34'),(639,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:16:07'),(640,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:17:07'),(641,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:18:07'),(642,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:19:07'),(643,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:20:07'),(644,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:21:07'),(645,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:22:07'),(646,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:23:07'),(647,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:24:07'),(648,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:25:16'),(649,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:26:16'),(650,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:27:16'),(651,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:28:16'),(652,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:29:16'),(653,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:30:16'),(654,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:31:16'),(655,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:32:16'),(656,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:33:16'),(657,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:34:16'),(658,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:35:16'),(659,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:36:16'),(660,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:38:08'),(661,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:39:08'),(662,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:40:08'),(663,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:41:09'),(664,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:42:09'),(665,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:43:09'),(666,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:44:09'),(667,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:45:09'),(668,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:46:09'),(669,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:47:09'),(670,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:48:09'),(671,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:49:09'),(672,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:50:09'),(673,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:51:09'),(674,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:52:09'),(675,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:53:09'),(676,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:54:09'),(677,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:55:28'),(678,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:56:28'),(679,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:57:28'),(680,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:58:28'),(681,'E006',49,0.00000000,0.00000000,'S Residence Tower 3',1,0,0,'2026-05-28 03:59:28'),(682,'E006',50,14.53329600,120.98820570,'S Residence Tower 3',1,1,0,'2026-05-28 04:19:12'),(683,'E006',50,0.00000000,0.00000000,'Outside Campus',0,0,0,'2026-05-28 04:19:32'),(684,'E006',50,14.53294900,120.98822840,'S Residence Tower 3',1,1,0,'2026-05-28 04:19:53'),(685,'E006',50,14.53294100,120.98818830,'S Residence Tower 3',1,1,0,'2026-05-28 04:20:13'),(686,'E006',50,14.53294690,120.98822410,'S Residence Tower 3',1,1,0,'2026-05-28 04:20:42'),(687,'E006',50,14.53293930,120.98821030,'S Residence Tower 3',1,1,0,'2026-05-28 04:21:10'),(688,'E006',50,14.53298150,120.98818580,'S Residence Tower 3',1,1,0,'2026-05-28 04:21:30'),(689,'E006',50,14.53295530,120.98820220,'S Residence Tower 3',1,1,0,'2026-05-28 04:21:42'),(690,'E006',50,14.53301770,120.98815280,'S Residence Tower 3',1,1,0,'2026-05-28 04:22:02'),(691,'E006',50,14.53295750,120.98821970,'S Residence Tower 3',1,1,0,'2026-05-28 04:22:22'),(692,'E006',50,14.53297430,120.98819940,'S Residence Tower 3',1,1,0,'2026-05-28 04:30:56'),(693,'E006',50,14.53336670,120.98820080,'S Residence Tower 3',1,1,0,'2026-05-28 04:38:35'),(694,'E006',50,14.53294590,120.98822820,'S Residence Tower 3',1,1,0,'2026-05-28 04:39:03'),(695,'E006',50,14.53299960,120.98823350,'S Residence Tower 3',1,1,0,'2026-05-28 04:39:27'),(696,'E006',50,14.53310290,120.98822160,'S Residence Tower 3',1,1,0,'2026-05-28 04:40:01');
/*!40000 ALTER TABLE `instructor_location_tracking` ENABLE KEYS */;
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
  `status` enum('new','reviewed','shortlisted','rejected','hired') NOT NULL DEFAULT 'new',
  `applied_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `score` decimal(5,2) DEFAULT '0.00',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `job_id` (`job_id`),
  CONSTRAINT `job_applicants_ibfk_1` FOREIGN KEY (`job_id`) REFERENCES `job_postings` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `job_applicants`
--

LOCK TABLES `job_applicants` WRITE;
/*!40000 ALTER TABLE `job_applicants` DISABLE KEYS */;
INSERT INTO `job_applicants` VALUES (1,1,'Kim Jean Yap','yapkimjean@gmail.com','09263909480','afadfd','/uploads/resumes/resume_1778582970704-517722664.pdf','reviewed','2026-05-12 10:49:30',0.00,'2026-05-25 09:05:31'),(2,3,'Kim Jean Yap','yapkimjean@gmail.com','09469738712','asdsdsd','/uploads/resumes/resume_1779700008937-306107954.pdf','new','2026-05-25 09:06:48',0.00,'2026-05-25 09:12:28'),(3,3,'SDSDS','yapkimjean@gmail.com','09469738712','','/uploads/resumes/resume_1779899771354-685728519.pdf','new','2026-05-27 16:36:11',0.00,'2026-05-27 16:36:11'),(4,4,'Kim Jean Yap','yapkimjean@gmail.com','09469738712','ada','/uploads/resumes/resume_1780028663094-595861673.pdf','new','2026-05-29 04:24:23',0.00,'2026-05-29 04:24:23');
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
  `location_type` varchar(50) DEFAULT 'On-site',
  `location` varchar(255) DEFAULT NULL,
  `salary_min` decimal(10,2) DEFAULT NULL,
  `salary_max` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `posted_by` (`posted_by`),
  CONSTRAINT `job_postings_ibfk_1` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `job_postings`
--

LOCK TABLES `job_postings` WRITE;
/*!40000 ALTER TABLE `job_postings` DISABLE KEYS */;
INSERT INTO `job_postings` VALUES (1,'NEED NEW SIMULATIONIST','EDUCATION','NEED ADAAafAFafADF','afDAFWFWfweSA','Full-time',NULL,15,'2026-05-12 10:23:11','On-site',NULL,NULL,NULL),(3,'xcxc','xcczcz','zdzd','dsss','Full-time','open',15,'2026-05-25 09:05:57','On-site','zxzcz',12000.00,30000.00),(4,'sdfdf','dfdfdf','dfff','dfdfdd','Full-time','open',15,'2026-05-27 16:20:57','On-site','dfdff',12000.00,33000.00);
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
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leave_requests`
--

LOCK TABLES `leave_requests` WRITE;
/*!40000 ALTER TABLE `leave_requests` DISABLE KEYS */;
INSERT INTO `leave_requests` VALUES (2,'E002',NULL,NULL,'2026-04-14 00:00:00','family','Approved',NULL,1,'Emergency',NULL,'2026-04-30 15:57:25'),(3,'E002',NULL,NULL,'2026-04-17 00:00:00','manila','Approved',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(4,'E002',NULL,NULL,'2026-04-20 00:00:00','dddd','Rejected',NULL,1,'Emergency',NULL,'2026-04-30 15:57:25'),(5,'E002',NULL,NULL,'2026-04-22 00:00:00','sss','Rejected',NULL,0,'Sick Leave',NULL,'2026-04-30 15:57:25'),(6,'E002',NULL,NULL,'2026-05-05 00:00:00','lagnat','Approved',NULL,1,'Sick Leave',NULL,'2026-04-30 15:57:25'),(7,'E002',NULL,NULL,'2026-05-07 00:00:00','bday','Rejected',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(8,'E002',NULL,NULL,'2026-05-08 00:00:00','monthsary','Rejected',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(9,'E002',NULL,NULL,'2026-05-09 00:00:00','Anniv','Rejected',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(10,'E002',NULL,NULL,'2026-05-15 00:00:00','pain','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 15:57:25'),(11,'E002',NULL,NULL,'2026-04-30 00:00:00','ss','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 18:33:21'),(12,'E002',NULL,NULL,'2026-05-22 00:00:00','gd','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 18:34:04'),(13,'E002',NULL,NULL,'2026-04-30 00:00:00','fsdfdd','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 18:34:25'),(14,'E002',NULL,NULL,'2026-05-06 00:00:00','sick','Approved',NULL,1,'Sick Leave',NULL,'2026-05-05 15:38:07'),(15,'E002',NULL,NULL,'2026-05-07 00:00:00','Fever','Rejected',NULL,1,'Sick Leave',NULL,'2026-05-05 19:28:02'),(16,'E002',NULL,NULL,'2026-05-11 00:00:00','vacation','Rejected',NULL,0,'Sick Leave',NULL,'2026-05-08 08:17:44'),(17,'E006',NULL,NULL,'2026-05-12 00:00:00','sixk','Approved',NULL,1,'Sick Leave',NULL,'2026-05-10 15:43:20'),(18,'E006',NULL,NULL,'2026-05-16 00:00:00','Sick','Rejected',NULL,0,'Sick Leave',NULL,'2026-05-15 04:20:49'),(19,'E006',NULL,NULL,'2026-05-19 00:00:00','Lslskdkd','Rejected',NULL,0,'Sick Leave',NULL,'2026-05-15 14:55:01'),(20,'E006',NULL,NULL,'2026-05-21 00:00:00','Bounce ka ako sah','Rejected',NULL,0,'Sick Leave',NULL,'2026-05-19 10:28:18');
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
-- Table structure for table `location_alerts`
--

DROP TABLE IF EXISTS `location_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `location_alerts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(20) NOT NULL,
  `schedule_id` int DEFAULT NULL,
  `latitude` decimal(10,8) DEFAULT NULL,
  `longitude` decimal(11,8) DEFAULT NULL,
  `alert_message` text NOT NULL,
  `is_resolved` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `employee_id` (`employee_id`,`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=89 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `location_alerts`
--

LOCK TABLES `location_alerts` WRITE;
/*!40000 ALTER TABLE `location_alerts` DISABLE KEYS */;
INSERT INTO `location_alerts` VALUES (79,'E006',NULL,0.00000000,0.00000000,'Connection lost: Instructor GPS stopped responding.',0,'2026-05-28 03:53:09'),(80,'E006',NULL,0.00000000,0.00000000,'Connection lost: Instructor GPS stopped responding.',0,'2026-05-28 03:54:09'),(81,'E006',NULL,0.00000000,0.00000000,'Connection lost: Instructor GPS stopped responding.',0,'2026-05-28 03:55:28'),(82,'E006',NULL,0.00000000,0.00000000,'Connection lost: Instructor GPS stopped responding.',0,'2026-05-28 03:56:28'),(83,'E006',NULL,0.00000000,0.00000000,'Connection lost: Instructor GPS stopped responding.',0,'2026-05-28 03:57:28'),(84,'E006',NULL,0.00000000,0.00000000,'Connection lost: Instructor GPS stopped responding.',0,'2026-05-28 03:58:28'),(85,'E006',NULL,0.00000000,0.00000000,'Connection lost: Instructor GPS stopped responding.',0,'2026-05-28 03:59:28'),(86,'E006',NULL,0.00000000,0.00000000,'GPS turned OFF',0,'2026-05-28 04:19:32'),(87,'E006',NULL,0.00000000,0.00000000,'GPS turned ON',0,'2026-05-28 04:19:53'),(88,'E006',NULL,0.00000000,0.00000000,'Entered campus',0,'2026-05-28 04:19:53');
/*!40000 ALTER TABLE `location_alerts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `overtime_requests`
--

DROP TABLE IF EXISTS `overtime_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `overtime_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `date` date NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `reason` text,
  `attachment` varchar(255) DEFAULT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `scenario_type` enum('future','ongoing','after_shift') NOT NULL DEFAULT 'future',
  `attendance_id` int DEFAULT NULL,
  `processed` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `attendance_id` (`attendance_id`),
  CONSTRAINT `overtime_requests_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `overtime_requests_ibfk_2` FOREIGN KEY (`attendance_id`) REFERENCES `attendance` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `overtime_requests`
--

LOCK TABLES `overtime_requests` WRITE;
/*!40000 ALTER TABLE `overtime_requests` DISABLE KEYS */;
INSERT INTO `overtime_requests` VALUES (1,6,'2026-05-28','05:00:00','06:00:00','Hajsjs',NULL,'rejected','2026-05-27 13:08:27','future',NULL,1);
/*!40000 ALTER TABLE `overtime_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_resets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email` varchar(100) NOT NULL,
  `otp` varchar(6) NOT NULL,
  `expires_at` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_resets`
--

LOCK TABLES `password_resets` WRITE;
/*!40000 ALTER TABLE `password_resets` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_resets` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payroll`
--

LOCK TABLES `payroll` WRITE;
/*!40000 ALTER TABLE `payroll` DISABLE KEYS */;
INSERT INTO `payroll` VALUES (1,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(2,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(3,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(4,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(5,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(6,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(7,NULL,'May 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(9,5,'March 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(10,6,'March 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(14,5,'May 2025',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(15,6,'May 2025',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(19,5,'May 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(20,6,'May 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(23,25,'May 2026',0.00,6.68,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00);
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
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payroll_access_logs`
--

LOCK TABLES `payroll_access_logs` WRITE;
/*!40000 ALTER TABLE `payroll_access_logs` DISABLE KEYS */;
INSERT INTO `payroll_access_logs` VALUES (1,9,'yapkimjean@gmail.com','2026-05-05 12:48:05'),(2,9,'yapkimjean@gmail.com','2026-05-05 12:48:32'),(3,9,'yapkimjean@gmail.com','2026-05-05 12:51:04'),(4,9,'yapkimjean@gmail.com','2026-05-05 14:04:47'),(5,9,'yapkimjean@gmail.com','2026-05-05 14:45:09'),(6,9,'yapkimjean@gmail.com','2026-05-05 15:26:54'),(7,9,'yapkimjean@gmail.com','2026-05-05 15:40:02'),(8,9,'yapkimjean@gmail.com','2026-05-05 16:13:01'),(9,9,'yapkimjean@gmail.com','2026-05-05 18:52:16'),(10,9,'yapkimjean@gmail.com','2026-05-06 03:08:10'),(11,9,'yapkimjean@gmail.com','2026-05-06 04:57:19'),(12,9,'yapkimjean@gmail.com','2026-05-06 04:58:27'),(13,15,'daennylyn@gmail.com','2026-05-10 12:13:59'),(14,15,'daennylyn@gmail.com','2026-05-10 12:52:12'),(15,15,'daennylyn@gmail.com','2026-05-10 13:02:41'),(16,15,'daennylyn@gmail.com','2026-05-10 13:09:09'),(17,15,'daennylyn@gmail.com','2026-05-10 13:09:20'),(18,15,'daennylyn@gmail.com','2026-05-12 11:21:39'),(19,15,'daennylyn@gmail.com','2026-05-12 13:03:52'),(20,15,'daennylyn@gmail.com','2026-05-12 14:46:30'),(21,15,'daennylyn@gmail.com','2026-05-14 12:45:02'),(22,15,'daennylyn@gmail.com','2026-05-16 10:14:56'),(23,9,'yapkimjean@gmail.com','2026-05-16 18:07:25'),(24,9,'yapkimjean@gmail.com','2026-05-16 18:12:01'),(25,9,'yapkimjean@gmail.com','2026-05-16 18:15:31'),(26,9,'yapkimjean@gmail.com','2026-05-17 05:01:22'),(27,9,'yapkimjean@gmail.com','2026-05-19 01:57:38'),(28,9,'yapkimjean@gmail.com','2026-05-19 02:40:42'),(29,15,'daennylyn@gmail.com','2026-05-19 02:43:41'),(30,9,'yapkimjean@gmail.com','2026-05-19 04:10:44'),(31,15,'daennylyn@gmail.com','2026-05-19 04:12:30'),(32,9,'yapkimjean@gmail.com','2026-05-19 06:42:39'),(33,15,'daennylyn@gmail.com','2026-05-19 10:00:59'),(34,9,'yapkimjean@gmail.com','2026-05-21 11:18:36'),(35,9,'yapkimjean@gmail.com','2026-05-25 08:11:21'),(36,15,'daennylyn@gmail.com','2026-05-25 09:12:41'),(37,9,'yapkimjean@gmail.com','2026-05-27 09:21:34'),(38,15,'daennylyn@gmail.com','2026-05-27 09:22:20'),(39,9,'yapkimjean@gmail.com','2026-05-27 12:33:26'),(40,9,'yapkimjean@gmail.com','2026-05-27 13:51:28'),(41,15,'daennylyn@gmail.com','2026-05-27 13:51:50'),(42,9,'yapkimjean@gmail.com','2026-05-27 14:11:42'),(43,15,'daennylyn@gmail.com','2026-05-27 15:00:04'),(44,15,'daennylyn@gmail.com','2026-05-27 16:20:00'),(45,9,'yapkimjean@gmail.com','2026-05-27 23:00:21'),(46,15,'daennylyn@gmail.com','2026-05-29 04:26:54'),(47,15,'daennylyn@gmail.com','2026-05-31 13:23:55');
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
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `resource` varchar(100) NOT NULL,
  `action` enum('can_view','can_edit','can_approve','can_delete') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_perm` (`resource`,`action`)
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
INSERT INTO `permissions` VALUES (21,'appointment','can_edit'),(17,'appointment_validation','can_approve'),(13,'attendance','can_view'),(14,'attendance','can_approve'),(20,'attendance_appeal','can_edit'),(3,'audit_log','can_view'),(5,'employee_record','can_view'),(6,'employee_record','can_edit'),(7,'employee_record','can_approve'),(22,'job_application','can_edit'),(11,'leave_request','can_view'),(12,'leave_request','can_approve'),(18,'map_monitoring','can_view'),(23,'own_document','can_edit'),(19,'own_schedule','can_view'),(8,'payroll','can_view'),(9,'payroll','can_edit'),(10,'payroll','can_approve'),(1,'system_config','can_view'),(2,'system_config','can_edit'),(4,'user_role','can_edit'),(15,'visitor_checkin','can_view'),(16,'visitor_checkin','can_edit');
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `role_id` int NOT NULL,
  `permission_id` int NOT NULL,
  PRIMARY KEY (`role_id`,`permission_id`),
  KEY `permission_id` (`permission_id`),
  CONSTRAINT `role_permissions_ibfk_1` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  CONSTRAINT `role_permissions_ibfk_2` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
INSERT INTO `role_permissions` VALUES (1,1),(1,2),(1,3),(1,4);
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` enum('admin','hr','security','instructor','visitor') NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
INSERT INTO `roles` VALUES (1,'admin','Full system governance, audit, role assignment, config'),(2,'hr','Employee lifecycle, payroll, leave, attendance approvals'),(3,'security','Visitor check-in, map monitoring, flagging'),(4,'instructor','View own schedule, submit attendance appeals, view students (if any)'),(5,'visitor','Appointment requests, job applications, own document uploads');
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedule_change_requests`
--

LOCK TABLES `schedule_change_requests` WRITE;
/*!40000 ALTER TABLE `schedule_change_requests` DISABLE KEYS */;
INSERT INTO `schedule_change_requests` VALUES (1,'E006','Dr. John Lloyd T. Danzalan','new','2026-05-14','dssf','dfAfa','08:00:00','17:00:00','adfaf','approved',NULL,'2026-05-12 15:29:37'),(2,'E006','Dr. John Lloyd T. Danzalan','change','2026-05-14','dssf','dfAfaasaasa','08:00:00','17:00:00','adfaf','rejected',NULL,'2026-05-12 15:39:36'),(3,'E006','Dr. John Lloyd T. Danzalan','change','2026-05-14','dssf','dfAfaasaasaaaa','08:00:00','17:00:00','adfaf','rejected','adaddaaaa','2026-05-12 15:43:56'),(4,'E006','John Lloyd  T Danzalan','new','2026-05-22','Main Campus','Hsjsisks\n','09:00:00','17:00:00','Hsjsisks\n','approved',NULL,'2026-05-19 07:13:20');
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
) ENGINE=InnoDB AUTO_INCREMENT=51 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedules`
--

LOCK TABLES `schedules` WRITE;
/*!40000 ALTER TABLE `schedules` DISABLE KEYS */;
INSERT INTO `schedules` VALUES (2,'E002','2026-04-07','Room 331','Healthcare101','19:00:00','20:00:00','Scheduled'),(3,'E002','2026-04-13','Room 331','Healthcare101','08:00:00','17:00:00','Scheduled'),(5,'E002','2026-05-01','National University - Manila','Healthcare101','15:00:00','17:00:00','Scheduled'),(11,'E002','2026-05-02','S Residence Tower 3','BSIT','22:33:00','22:50:00','Scheduled'),(13,'E007','2026-05-02','Sun Residence Tower 1','BSIT','22:33:00','22:40:00','Scheduled'),(14,'E002','2026-05-08','HCT Academy Pasig','BSIT','08:00:00','09:00:00','Scheduled'),(15,'E007','2026-05-08','National University - Manila','Healthcare101','08:00:00','17:00:00','Scheduled'),(16,'E002','2026-05-11','HCT Academy Pasig','Allied Health 2','08:00:00','17:00:00','Scheduled'),(17,'E002','2026-05-12','Colegio de San Agustin - Bacolod','Healthcare101','08:00:00','17:00:00','Scheduled'),(18,'E002','2026-05-06','S Residence Tower 3','Healthcare101','03:32:00','04:00:00','Scheduled'),(19,'E009','2026-05-06','S Residence Tower 3','Healthcare101','03:34:00','04:00:00','Scheduled'),(20,'E006','2026-05-06','National University - MOA','Healthcare101','13:14:00','14:00:00','Scheduled'),(22,'E006','2026-05-16','Olivarez College Paranaque','Allied Health 2','08:00:00','17:00:00','Scheduled'),(23,'E006','2026-05-15','S Residence Tower 3','Allied Health 2','21:35:00','22:00:00','Scheduled'),(27,'','2026-05-19','S Residence Tower 3','Allied Health 2','13:27:00','13:29:00','Scheduled'),(30,'E006','2026-05-19','S Residence Tower 3','Allied Health 2','22:51:00','23:15:00','Scheduled'),(33,'E006','2026-05-22','S Residence Tower 3','Healthcare101','08:00:00','17:00:00','Scheduled'),(36,'','2026-05-21','S Residence Tower 3','Allied Health 2','08:10:00','09:00:00','Scheduled'),(37,'E006','2026-05-21','S Residence Tower 3','Healthcare101','08:15:00','09:00:00','Scheduled'),(38,'E006','2026-05-21','S Residence Tower 3','Healthcare101','10:00:00','16:40:00','Scheduled'),(39,'E006','2026-05-21','S Residence Tower 3','Allied Health 2','18:00:00','22:00:00','Scheduled'),(40,'E006','2026-05-25','S Residence Tower 3','Healthcare101','18:50:00','19:00:00','Scheduled'),(41,'E006','2026-05-27','S Residence Tower 3','Allied Health 2','10:16:00','23:00:00','Scheduled'),(42,'E006','2026-05-27','S Residence Tower 3','Allied Health 2','23:00:00','23:40:00','Scheduled'),(43,'E006','2026-05-28','S Residence Tower 3','Healthcare101','07:30:00','08:00:00','Scheduled'),(44,'E006','2026-05-28','S Residence Tower 3','Allied Health 2','08:00:00','08:30:00','Scheduled'),(45,'E006','2026-05-28','S Residence Tower 3','Allied Health 2','08:37:00','09:00:00','Scheduled'),(46,'E006','2026-05-28','S Residence Tower 3','Healthcare101','09:08:00','09:30:00','Scheduled'),(47,'E006','2026-05-28','S Residence Tower 3','Allied Health 2','10:00:00','10:30:00','Scheduled'),(48,'E006','2026-05-28','S Residence Tower 3','Healthcare101','10:41:00','11:00:00','Scheduled'),(49,'E006','2026-05-28','S Residence Tower 3','Allied Health 2','11:10:00','12:00:00','Scheduled'),(50,'E006','2026-05-28','S Residence Tower 3','Allied Health 2','12:05:00','13:00:00','Scheduled');
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
-- Table structure for table `system_config`
--

DROP TABLE IF EXISTS `system_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_config` (
  `id` int NOT NULL DEFAULT '1',
  `password_expiry_days` int DEFAULT '365',
  `otp_expiry_minutes` int DEFAULT '5',
  `geofence_default_radius` int DEFAULT '200',
  `max_login_attempts` int DEFAULT '5',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `system_config`
--

LOCK TABLES `system_config` WRITE;
/*!40000 ALTER TABLE `system_config` DISABLE KEYS */;
INSERT INTO `system_config` VALUES (1,365,5,200,5,'2026-05-16 17:40:01');
/*!40000 ALTER TABLE `system_config` ENABLE KEYS */;
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
INSERT INTO `user_chat_read` VALUES (6,9,'2026-05-10 16:37:32'),(9,7,'2026-05-14 13:31:30'),(9,9,'2026-05-14 13:31:30'),(15,7,'2026-05-19 10:06:37'),(15,9,'2026-05-19 10:06:37'),(17,9,'2026-05-12 11:37:20');
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
  `title` varchar(50) DEFAULT NULL,
  `first_name` varchar(100) DEFAULT NULL,
  `middle_initial` varchar(50) DEFAULT NULL,
  `last_name` varchar(100) DEFAULT NULL,
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
  `role_id` int DEFAULT NULL,
  `fingerprint_hash` varchar(255) DEFAULT NULL COMMENT 'store hash of fingerprint template',
  `biometric_enabled` tinyint(1) DEFAULT '0',
  `temp_forgot_clock` json DEFAULT NULL COMMENT 'store pending attendance correction',
  `date_of_joining` date DEFAULT NULL,
  `account_expiration_date` date DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `gender` enum('male','female','other','prefer_not_to_say') DEFAULT 'prefer_not_to_say',
  `emergency_contact_name` varchar(100) DEFAULT NULL,
  `emergency_contact_phone` varchar(20) DEFAULT NULL,
  `street_address` varchar(255) DEFAULT NULL,
  `city` varchar(100) DEFAULT NULL,
  `state_province` varchar(100) DEFAULT NULL,
  `postal_code` varchar(20) DEFAULT NULL,
  `country` varchar(100) DEFAULT 'Philippines',
  `additional_info` text,
  `position` varchar(100) DEFAULT NULL,
  `last_location_ping` timestamp NULL DEFAULT NULL,
  `location_tracking_enabled` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_id` (`employee_id`),
  UNIQUE KEY `email` (`email`),
  KEY `users_ibfk_role` (`role_id`),
  CONSTRAINT `users_ibfk_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=26 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'ADM01',NULL,NULL,NULL,NULL,'System Admin','admin@email.com','admin123','admin','deactivated','2026-02-10 13:01:42','2026-04-07','Full-time','Senior Simulationist','Regular',30000.00,22,'1234',0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'prefer_not_to_say',NULL,NULL,NULL,NULL,NULL,NULL,'Philippines',NULL,NULL,NULL,1),(5,'E003',NULL,NULL,NULL,NULL,'Dr. Maui S. Torres','mawie@gmail.com','emp1234','instructor','deactivated','2026-02-11 05:36:44','2026-04-07','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'prefer_not_to_say',NULL,NULL,NULL,NULL,NULL,NULL,'Philippines',NULL,NULL,NULL,1),(6,'E006',NULL,'John Lloyd','T','Danzalan','John Lloyd T Danzalan','danzi9012004@gmail.com','emp1234','instructor','active','2026-02-11 12:42:52','2026-05-11',NULL,'Entry Level Simulationist','Regular',32000.00,22,'1234',0,NULL,NULL,0,NULL,'2026-02-24','2028-01-24','2005-05-22','09263909480','male','','','S Residence Tower 3','Pasay','NCR','1300','Philippines','',NULL,'2026-05-28 04:40:01',1),(9,'ADM02',NULL,NULL,NULL,NULL,'Admin Kim','yapkimjean@gmail.com','admin123','admin','active','2026-05-04 14:57:24','2026-05-04','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'prefer_not_to_say',NULL,NULL,NULL,NULL,NULL,NULL,'Philippines',NULL,NULL,NULL,1),(15,'E007',NULL,NULL,NULL,NULL,'Alliah','daennylyn@gmail.com','emp007','hr_admin','active','2026-05-10 12:03:47','2026-05-10','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',1,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'prefer_not_to_say',NULL,NULL,NULL,NULL,NULL,NULL,'Philippines',NULL,NULL,NULL,1),(17,'E008',NULL,NULL,NULL,NULL,'Kate','ykean119@gmail.com','emp008','security','active','2026-05-10 12:18:55','2026-05-10','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,'prefer_not_to_say',NULL,NULL,NULL,NULL,NULL,NULL,'Philippines',NULL,NULL,NULL,1),(25,'E009',NULL,NULL,NULL,NULL,'Thea S Martinez','theakmartinez@gmail.com','emp009','instructor','active','2026-05-21 11:16:47','2026-05-21',NULL,'Entry Level Simulationist','Regular',32000.00,22,'1234',0,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'Philippines',NULL,NULL,NULL,1);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `visit_reasons`
--

DROP TABLE IF EXISTS `visit_reasons`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `visit_reasons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `reason_text` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visit_reasons`
--

LOCK TABLES `visit_reasons` WRITE;
/*!40000 ALTER TABLE `visit_reasons` DISABLE KEYS */;
INSERT INTO `visit_reasons` VALUES (1,'Meeting'),(5,'Facility Tour');
/*!40000 ALTER TABLE `visit_reasons` ENABLE KEYS */;
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
  `visitor_name` varchar(255) NOT NULL,
  `ble_id` varchar(50) NOT NULL,
  `floor` varchar(10) DEFAULT NULL,
  `current_room` varchar(255) DEFAULT NULL,
  `event_type` enum('enter','move','exit') NOT NULL,
  `x` decimal(10,2) DEFAULT NULL,
  `y` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_visitor` (`visitor_id`),
  KEY `idx_date` (`created_at`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visitor_history`
--

LOCK TABLES `visitor_history` WRITE;
/*!40000 ALTER TABLE `visitor_history` DISABLE KEYS */;
INSERT INTO `visitor_history` VALUES (1,'Kim Jean Yap','Kim Jean Yap','ESP32-Badge1','5','Classroom 2','enter',NULL,NULL,'2026-05-27 17:24:25'),(2,'Kim Jean Yap','Kim Jean Yap','ESP32-Badge1','5','Classroom 1','move',NULL,NULL,'2026-05-27 17:25:42');
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
  `no_show` tinyint(1) DEFAULT '0',
  `no_show_at` timestamp NULL DEFAULT NULL,
  `arrived_at` timestamp NULL DEFAULT NULL,
  `arrived` tinyint(1) DEFAULT '0',
  `destination` varchar(255) DEFAULT NULL,
  `returned` tinyint(1) DEFAULT '0',
  `returned_at` timestamp NULL DEFAULT NULL,
  `used_ble_id` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_admin_processor` (`processed_by`),
  CONSTRAINT `fk_admin_processor` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `visitor_requests_ibfk_1` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=61 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visitor_requests`
--

LOCK TABLES `visitor_requests` WRITE;
/*!40000 ALTER TABLE `visitor_requests` DISABLE KEYS */;
INSERT INTO `visitor_requests` VALUES (29,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-20','18:38:00','Facility Tour','APPROVED',NULL,'2026-05-20 10:36:21',9,'2026-05-20 10:36:33','+639469738712',NULL,0,NULL,'2026-05-20 11:59:53',1,'Classroom 2',1,'2026-05-20 12:26:26',NULL),(30,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-20','19:33:00','Facility Tour','APPROVED',NULL,'2026-05-20 11:32:41',9,'2026-05-20 11:33:04','+639469738712',NULL,0,NULL,'2026-05-20 11:57:33',1,'Classroom 1',1,'2026-05-20 14:53:11',NULL),(31,'danzi','','danzi9012004@gmail.com','2026-05-20','20:02:00','Facility Tour','APPROVED',NULL,'2026-05-20 12:01:46',9,'2026-05-20 12:02:27','09169562991',NULL,0,NULL,'2026-05-20 12:28:10',1,'Classroom 2',1,'2026-05-20 12:49:38',NULL),(32,'danzi','','danzi9012004@gmail.com','2026-05-20','20:51:00','Facility Tour','APPROVED',NULL,'2026-05-20 12:50:59',9,'2026-05-20 12:51:09','+639263909480',NULL,0,NULL,'2026-05-20 12:51:41',1,'Classroom 2',1,'2026-05-20 14:40:35',NULL),(35,'danzzz','','daennylyn@gmail.com','2026-05-20','22:50:00','Facility Tour','APPROVED',NULL,'2026-05-20 14:48:58',9,'2026-05-20 14:49:18','+639263909480',NULL,0,NULL,'2026-05-20 14:52:32',1,'Classroom 2',1,'2026-05-20 15:21:24',NULL),(36,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-20','23:25:00','Facility Tour','APPROVED',NULL,'2026-05-20 15:21:39',9,'2026-05-20 15:21:53','+639469738712',NULL,0,NULL,'2026-05-20 15:23:13',1,'Classroom 2',1,'2026-05-20 15:36:02',NULL),(37,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-20','23:38:00','Facility Tour','APPROVED',NULL,'2026-05-20 15:36:24',9,'2026-05-20 15:36:35','+639469738712',NULL,0,NULL,'2026-05-20 15:37:04',1,'Classroom 2',1,'2026-05-20 16:03:27',NULL),(38,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-21','00:05:00','Facility Tour','APPROVED',NULL,'2026-05-20 16:03:54',9,'2026-05-20 16:04:03','+639469738712',NULL,0,NULL,'2026-05-20 16:09:03',1,'Classroom 1',1,'2026-05-20 16:15:25',NULL),(39,'danzz','','daennylyn@gmail.com','2026-05-21','00:16:00','Facility Tour','APPROVED',NULL,'2026-05-20 16:16:06',9,'2026-05-20 16:16:13','+639263909480',NULL,0,NULL,'2026-05-20 16:16:59',1,'Classroom 1',1,'2026-05-20 16:22:44',NULL),(40,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-21','00:24:00','Facility Tour','APPROVED',NULL,'2026-05-20 16:23:06',9,'2026-05-20 16:23:15','+639469738712',NULL,0,NULL,'2026-05-20 16:24:12',1,'Classroom 1',1,'2026-05-21 07:52:09',NULL),(41,'danzzz','','danzi9012004@gmail.com','2026-05-21','00:33:00','Facility Tour','APPROVED',NULL,'2026-05-20 16:32:53',9,'2026-05-20 16:33:01','+639469738712',NULL,0,NULL,'2026-05-20 16:33:37',1,'Classroom 1',1,'2026-05-21 07:52:10',NULL),(42,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-21','16:01:00','Facility Tour','APPROVED',NULL,'2026-05-21 08:01:59',9,'2026-05-21 08:03:01','+639469738712',NULL,0,NULL,'2026-05-21 08:04:17',1,'Classroom 1',1,'2026-05-27 18:04:24','ESP32-Badge1'),(43,'danzalan','','danzi9012004@gmail.com','2026-05-21','16:02:00','Facility Tour','APPROVED',NULL,'2026-05-21 08:02:22',9,'2026-05-21 08:03:05','+639263909480',NULL,0,NULL,'2026-05-21 08:04:28',1,'Classroom 2',1,'2026-05-27 08:44:42','ESP 32-Badge2'),(44,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','00:59:00','Facility Tour','APPROVED',NULL,'2026-05-27 16:55:18',9,'2026-05-27 16:56:30','+639469738712',NULL,0,NULL,'2026-05-27 16:57:35',1,'Classroom 2',1,'2026-05-27 16:59:06','ESP32-Badge1'),(45,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','01:00:00','Facility Tour','APPROVED',NULL,'2026-05-27 16:59:44',17,'2026-05-27 16:59:57','+639469738712',NULL,0,NULL,'2026-05-27 17:00:31',1,'Classroom 2',1,'2026-05-27 17:20:14','ESP32-Badge1'),(46,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','01:22:00','Facility Tour','APPROVED',NULL,'2026-05-27 17:20:27',9,'2026-05-27 17:20:49','+639469738712',NULL,0,NULL,'2026-05-27 17:21:24',1,'Classroom 2',1,'2026-05-27 17:28:40','ESP32-Badge1'),(47,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','01:29:00','Facility Tour','APPROVED',NULL,'2026-05-27 17:28:59',9,'2026-05-27 17:29:15','+639469738712',NULL,0,NULL,'2026-05-27 17:29:28',1,'Classroom 1',1,'2026-05-27 17:32:41','ESP 32-Badge2'),(48,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','01:34:00','Facility Tour','APPROVED',NULL,'2026-05-27 17:33:51',9,'2026-05-27 17:34:08','+639469738712',NULL,0,NULL,'2026-05-27 17:34:21',1,'Classroom 2',1,'2026-05-27 17:36:32','ESP 32-Badge2'),(49,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','01:37:00','Facility Tour','APPROVED',NULL,'2026-05-27 17:36:54',9,'2026-05-27 17:37:11','+639469738712',NULL,0,NULL,'2026-05-27 17:37:22',1,'Classroom 2',1,'2026-05-27 17:40:12',NULL),(50,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','01:43:00','Facility Tour','APPROVED',NULL,'2026-05-27 17:41:06',9,'2026-05-27 17:41:22','+639469738712',NULL,0,NULL,'2026-05-27 17:41:33',1,'Classroom 2',1,'2026-05-27 17:43:41','ESP32-Badge1'),(51,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','01:47:00','Facility Tour','APPROVED',NULL,'2026-05-27 17:45:44',9,'2026-05-27 17:45:59','+639469738712',NULL,0,NULL,'2026-05-27 17:46:10',1,'Classroom 2',1,'2026-05-27 17:50:03',NULL),(52,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','01:52:00','Facility Tour','APPROVED',NULL,'2026-05-27 17:51:04',9,'2026-05-27 17:51:20','+639469738712',NULL,0,NULL,'2026-05-27 17:51:35',1,'Classroom 2',1,'2026-05-27 17:55:25','ESP32-Badge1'),(53,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','01:57:00','Facility Tour','APPROVED',NULL,'2026-05-27 17:55:42',9,'2026-05-27 17:55:59','+639469738712',NULL,0,NULL,'2026-05-27 17:57:12',1,'Classroom 2',1,'2026-05-27 18:02:42','ESP 32-Badge2'),(54,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','02:03:00','Facility Tour','APPROVED',NULL,'2026-05-27 18:02:58',9,'2026-05-27 18:03:17','+639469738712',NULL,0,NULL,'2026-05-27 18:03:29',1,'Classroom 2',1,'2026-05-27 18:06:19',NULL),(55,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','02:08:00','Facility Tour','APPROVED',NULL,'2026-05-27 18:07:28',9,'2026-05-27 18:07:44','+639469738712',NULL,0,NULL,'2026-05-27 18:07:57',1,'Classroom 2',1,'2026-05-27 18:15:05','ESP32-Badge1'),(56,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','02:16:00','Facility Tour','APPROVED',NULL,'2026-05-27 18:15:32',9,'2026-05-27 18:15:54','+639469738712',NULL,0,NULL,'2026-05-27 18:16:05',1,'Classroom 2',1,'2026-05-27 18:17:37','ESP32-Badge1'),(57,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-28','02:27:00','Facility Tour','APPROVED',NULL,'2026-05-27 18:26:42',9,'2026-05-27 18:27:00','+639469738712',NULL,0,NULL,'2026-05-27 18:27:11',1,'Classroom 2',1,'2026-05-27 18:33:28','ESP32-Badge1'),(58,'Kim','Jean Yap','yapkimjean@gmail.com','2026-05-29','13:00:00','Facility Tour','APPROVED',NULL,'2026-05-29 04:23:56',9,'2026-05-29 04:25:36','+639469738712',NULL,0,NULL,NULL,0,NULL,0,NULL,NULL),(59,'Kim','Jean Yap','yapkimjean@gmail.com','2026-06-03','16:59:00','Facility Tour','APPROVED',NULL,'2026-06-03 08:58:49',9,'2026-06-03 08:59:55','+639469738712',NULL,0,NULL,'2026-06-03 09:00:53',1,'Classroom 1',1,'2026-06-03 09:24:40','ESP32-Badge1'),(60,'Kim','Jean Yap','yapkimjean@gmail.com','2026-06-03','17:26:00','Facility Tour','APPROVED',NULL,'2026-06-03 09:25:23',9,'2026-06-03 09:26:07','+639469738712','ESP32-Badge1',0,NULL,'2026-06-03 09:27:08',1,'Classroom 1',0,NULL,NULL);
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

-- Dump completed on 2026-07-31 13:53:49

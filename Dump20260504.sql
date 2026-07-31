-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: security_system_db
-- ------------------------------------------------------
-- Server version	8.0.46

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
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance`
--

LOCK TABLES `attendance` WRITE;
/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
INSERT INTO `attendance` VALUES (1,'E002','2026-04-07','19:16:24','20:00:41','present','G2Q2+388, Pasay City',0.00),(2,'E002','2026-04-14',NULL,NULL,'on leave','Remote/Leave',0.00),(3,'E002','2026-04-17',NULL,NULL,'on leave','Remote/Leave',0.00),(6,'EMP003','2026-04-24','09:00:00','17:00:00','late','Main Campus',0.00),(7,'E006','2026-04-24','08:00:00','17:00:00','present','Main Campus',0.00),(8,'E003','2026-04-24','08:30:00','17:00:00','late','Main Campus',0.00),(9,'E002','2026-04-24','09:00:00','17:00:00','late','Main Campus',0.00);
/*!40000 ALTER TABLE `attendance` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `geofence_settings`
--

DROP TABLE IF EXISTS `geofence_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `geofence_settings` (
  `id` int NOT NULL DEFAULT '1',
  `latitude` decimal(10,8) NOT NULL,
  `longitude` decimal(11,8) NOT NULL,
  `radius_meters` int DEFAULT '100',
  `location_name` varchar(255) DEFAULT 'Main Campus',
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `geofence_settings`
--

LOCK TABLES `geofence_settings` WRITE;
/*!40000 ALTER TABLE `geofence_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `geofence_settings` ENABLE KEYS */;
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
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leave_requests`
--

LOCK TABLES `leave_requests` WRITE;
/*!40000 ALTER TABLE `leave_requests` DISABLE KEYS */;
INSERT INTO `leave_requests` VALUES (2,'E002',NULL,NULL,'2026-04-14 00:00:00','family','Approved',NULL,1,'Emergency'),(3,'E002',NULL,NULL,'2026-04-17 00:00:00','manila','Approved',NULL,1,'Vacation'),(4,'E002',NULL,NULL,'2026-04-20 00:00:00','dddd','Rejected',NULL,1,'Emergency'),(5,'E002',NULL,NULL,'2026-04-22 00:00:00','sss','Pending',NULL,0,'Sick Leave');
/*!40000 ALTER TABLE `leave_requests` ENABLE KEYS */;
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
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `payroll_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payroll`
--

LOCK TABLES `payroll` WRITE;
/*!40000 ALTER TABLE `payroll` DISABLE KEYS */;
/*!40000 ALTER TABLE `payroll` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedules`
--

LOCK TABLES `schedules` WRITE;
/*!40000 ALTER TABLE `schedules` DISABLE KEYS */;
INSERT INTO `schedules` VALUES (2,'E002','2026-04-07','Room 331','Healthcare101','19:00:00','20:00:00','Scheduled'),(3,'E002','2026-04-13','Room 331','Healthcare101','08:00:00','17:00:00','Scheduled'),(6,'E002','2026-04-24','Main Campus','Test','08:00:00','17:00:00','Scheduled'),(7,'E003','2026-04-24','Main Campus','Test','08:00:00','17:00:00','Scheduled'),(8,'E006','2026-04-24','Main Campus','Test','08:00:00','17:00:00','Scheduled');
/*!40000 ALTER TABLE `schedules` ENABLE KEYS */;
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
  `salary_rate` decimal(10,2) DEFAULT '500.00',
  `overtime_rate` decimal(10,2) DEFAULT '150.00',
  `password_last_changed` date DEFAULT (curdate()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_id` (`employee_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'ADM01','System Admin','admin@email.com','admin123','admin','active','2026-02-10 13:01:42',500.00,150.00,'2026-04-07'),(3,'E002','Ms. Kim Jean S. Yap','yapkim@email.com','password123','instructor','active','2026-02-10 15:37:14',1500.00,150.00,'2026-04-12'),(5,'E003','Dr. Maui S. Torres','mawie@gmail.com','emp1234','instructor','active','2026-02-11 05:36:44',2000.00,150.00,'2026-04-07'),(6,'E006','Dr. John Lloyd T. Danzalan','danzalan@email.com','emp12345','instructor','active','2026-02-11 12:42:52',1000.00,200.00,'2026-04-07'),(7,'E007','Mr. James T. Lagria','lagria@email.com','emp123456','instructor','active','2026-02-11 12:48:57',500.00,150.00,'2026-04-07'),(8,'E008','Dr. Testdata T. Test','test@email.com','emp1234','instructor','active','2026-02-11 12:59:40',500.00,150.00,'2026-04-07'),(9,'ADM02','Daniel Lagria','Lagriadaniel0@gmail.com','Admin123','Admin','active','2026-05-04 13:42:15',500.00,150.00,'2026-05-04');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
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
  PRIMARY KEY (`id`),
  KEY `fk_admin_processor` (`processed_by`),
  CONSTRAINT `fk_admin_processor` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`),
  CONSTRAINT `visitor_requests_ibfk_1` FOREIGN KEY (`processed_by`) REFERENCES `users` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visitor_requests`
--

LOCK TABLES `visitor_requests` WRITE;
/*!40000 ALTER TABLE `visitor_requests` DISABLE KEYS */;
INSERT INTO `visitor_requests` VALUES (1,'Kim Jean','Yap','yapkimjean@gmail.com','2026-04-08','10:00:00','Meeting with dr.','APPROVED','We look forward to seeing you at HCT Academy!','2026-04-06 14:56:32',NULL,NULL),(2,'Tes','Data','daennylyn@gmail.com','2026-04-10','11:00:00','Meeting','APPROVED','We look forward to seeing you at HCT Academy!','2026-04-06 15:30:03',NULL,NULL),(3,'Test again','Data','daennylyn@gmail.com','2026-04-16','08:00:00','MEETING WITH NUSRSE','APPROVED',NULL,'2026-04-06 15:36:02',NULL,NULL),(4,'Test again','Data','daennylyn@gmail.com','2026-04-15','11:46:00','MEETING','REJECTED','Sorry, we have a schedule conflict.','2026-04-06 15:38:53',NULL,NULL),(5,'Test ','Data','daennylyn@gmail.com','2026-04-13','14:40:00','meeting','APPROVED',NULL,'2026-04-06 15:39:52',NULL,NULL),(6,'Test again','Data','daennylyn@gmail.com','2026-04-21','12:03:00','meeting','APPROVED','','2026-04-06 16:04:06',1,'2026-04-06 16:18:08'),(7,'dsada','dasda','danzi9012004@gmail.com','2026-04-24','10:22:00','a','APPROVED','','2026-04-24 02:22:56',1,'2026-04-24 04:02:03'),(8,'dasdasda','asdasdas','asdasdas@gmail.com','2026-04-24','10:23:00','dasdas','REJECTED','Schedule conflict.','2026-04-24 02:23:50',1,'2026-04-24 04:02:14'),(9,'dasdasda','asdadas','danzi9012004@gmail.com','2026-04-24','10:24:00','dasdad','APPROVED','','2026-04-24 02:24:07',1,'2026-04-24 04:02:21'),(10,'John','Lloyd','danzi9012004@gmail.com','2026-04-25','23:28:00','rea','APPROVED','','2026-04-24 02:27:43',1,'2026-04-24 04:02:36');
/*!40000 ALTER TABLE `visitor_requests` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-05-04 21:42:56

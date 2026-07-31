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

SET @@GLOBAL.GTID_PURGED=/*!80000 '+'*/ '3bd31b54-ffea-11f0-82d0-74d4dd636397:1-796';

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
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
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_date` (`user_id`,`date`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance`
--

LOCK TABLES `attendance` WRITE;
/*!40000 ALTER TABLE `attendance` DISABLE KEYS */;
INSERT INTO `attendance` VALUES (1,'E002','2026-04-07','19:16:24','20:00:41','present','G2Q2+388, Pasay City',0.00),(2,'E002','2026-04-14',NULL,NULL,'on leave','Remote/Leave',0.00),(3,'E002','2026-04-17',NULL,NULL,'on leave','Remote/Leave',0.00),(4,'E002','2026-05-05',NULL,NULL,'on leave','Remote/Leave',0.00),(5,'E002','2026-05-01','15:00:00','17:00:00','present','Appeal Approved',2.00),(9,'E002','2026-05-02','20:33:25','22:22:09','late','Pearl Drive, Pasay City',0.00),(10,'E007','2026-05-02','22:33:41','22:41:21','late','España Boulevard, Quezon City',0.00);
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
INSERT INTO `attendance_appeals` VALUES (1,'E002','2026-05-01','Headache',NULL,'approved',NULL,'2026-05-01 10:05:45',NULL,NULL),(2,'E002','2026-05-01','sick',NULL,'approved',NULL,'2026-05-01 10:07:00',NULL,NULL),(3,'E002','2026-05-02','LBM',NULL,'approved',NULL,'2026-05-02 02:07:33',NULL,NULL),(4,'E002','2026-05-02','SICK',NULL,'rejected',NULL,'2026-05-02 02:16:43',NULL,NULL),(5,'E002','2026-05-02','sick',NULL,'rejected',NULL,'2026-05-02 02:51:20',NULL,NULL);
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
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courses`
--

LOCK TABLES `courses` WRITE;
/*!40000 ALTER TABLE `courses` DISABLE KEYS */;
INSERT INTO `courses` VALUES (1,'Healthcare101');
/*!40000 ALTER TABLE `courses` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
INSERT INTO `events` VALUES (7,'MMM','2026-05-08','LLLL','10:04:00','20:04:00','Meeting','');
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `leave_requests`
--

LOCK TABLES `leave_requests` WRITE;
/*!40000 ALTER TABLE `leave_requests` DISABLE KEYS */;
INSERT INTO `leave_requests` VALUES (2,'E002',NULL,NULL,'2026-04-14 00:00:00','family','Approved',NULL,1,'Emergency',NULL,'2026-04-30 15:57:25'),(3,'E002',NULL,NULL,'2026-04-17 00:00:00','manila','Approved',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(4,'E002',NULL,NULL,'2026-04-20 00:00:00','dddd','Rejected',NULL,1,'Emergency',NULL,'2026-04-30 15:57:25'),(5,'E002',NULL,NULL,'2026-04-22 00:00:00','sss','Rejected',NULL,0,'Sick Leave',NULL,'2026-04-30 15:57:25'),(6,'E002',NULL,NULL,'2026-05-05 00:00:00','lagnat','Approved',NULL,1,'Sick Leave',NULL,'2026-04-30 15:57:25'),(7,'E002',NULL,NULL,'2026-05-07 00:00:00','bday','Rejected',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(8,'E002',NULL,NULL,'2026-05-08 00:00:00','monthsary','Rejected',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(9,'E002',NULL,NULL,'2026-05-09 00:00:00','Anniv','Rejected',NULL,1,'Vacation',NULL,'2026-04-30 15:57:25'),(10,'E002',NULL,NULL,'2026-05-15 00:00:00','pain','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 15:57:25'),(11,'E002',NULL,NULL,'2026-04-30 00:00:00','ss','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 18:33:21'),(12,'E002',NULL,NULL,'2026-05-22 00:00:00','gd','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 18:34:04'),(13,'E002',NULL,NULL,'2026-04-30 00:00:00','fsdfdd','Rejected',NULL,1,'Sick Leave',NULL,'2026-04-30 18:34:25'),(14,'E002',NULL,NULL,'2026-05-06 00:00:00','sick','Pending',NULL,0,'Sick Leave',NULL,'2026-05-05 15:38:07');
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
INSERT INTO `payroll` VALUES (1,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(2,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(3,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(4,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(5,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(6,NULL,'April 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(7,NULL,'May 2026',200.00,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(8,3,'March 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(9,5,'March 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(10,6,'March 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(11,7,'March 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(12,8,'March 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(13,3,'May 2025',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(14,5,'May 2025',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(15,6,'May 2025',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(16,7,'May 2025',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(17,8,'May 2025',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(18,3,'May 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(19,5,'May 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(20,6,'May 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(21,7,'May 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00),(22,8,'May 2026',170.45,0.00,0.00,'paid',0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00,0.00);
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
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payroll_access_logs`
--

LOCK TABLES `payroll_access_logs` WRITE;
/*!40000 ALTER TABLE `payroll_access_logs` DISABLE KEYS */;
INSERT INTO `payroll_access_logs` VALUES (1,9,'yapkimjean@gmail.com','2026-05-05 12:48:05'),(2,9,'yapkimjean@gmail.com','2026-05-05 12:48:32'),(3,9,'yapkimjean@gmail.com','2026-05-05 12:51:04'),(4,9,'yapkimjean@gmail.com','2026-05-05 14:04:47'),(5,9,'yapkimjean@gmail.com','2026-05-05 14:45:09'),(6,9,'yapkimjean@gmail.com','2026-05-05 15:26:54'),(7,9,'yapkimjean@gmail.com','2026-05-05 15:40:02'),(8,9,'yapkimjean@gmail.com','2026-05-05 16:13:01');
/*!40000 ALTER TABLE `payroll_access_logs` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=16 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schedules`
--

LOCK TABLES `schedules` WRITE;
/*!40000 ALTER TABLE `schedules` DISABLE KEYS */;
INSERT INTO `schedules` VALUES (2,'E002','2026-04-07','Room 331','Healthcare101','19:00:00','20:00:00','Scheduled'),(3,'E002','2026-04-13','Room 331','Healthcare101','08:00:00','17:00:00','Scheduled'),(5,'E002','2026-05-01','National University - Manila','Healthcare101','15:00:00','17:00:00','Scheduled'),(11,'E002','2026-05-02','S Residence Tower 3','BSIT','22:33:00','22:50:00','Scheduled'),(13,'E007','2026-05-02','Sun Residence Tower 1','BSIT','22:33:00','22:40:00','Scheduled'),(14,'E002','2026-05-08','HCT Academy Pasig','BSIT','08:00:00','09:00:00','Scheduled'),(15,'E007','2026-05-08','National University - Manila','Healthcare101','08:00:00','17:00:00','Scheduled');
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
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `school_locations`
--

LOCK TABLES `school_locations` WRITE;
/*!40000 ALTER TABLE `school_locations` DISABLE KEYS */;
INSERT INTO `school_locations` VALUES (1,'HCT Academy Pasig',14.5747800,121.0607000,200),(2,'National University - Manila',14.6042947,120.9942832,200),(3,'Olivarez College Paranaque',14.4788410,120.9963350,200),(4,'Wesleyan University Philippines',15.4844880,120.9760450,200),(5,'Colegio de San Agustin - Bacolod',10.6626200,122.9764100,200),(6,'S Residence Tower 3',14.5334600,120.9880800,150),(7,'Sun Residence Tower 1',14.6182800,121.0005900,150);
/*!40000 ALTER TABLE `school_locations` ENABLE KEYS */;
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
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'ADM01','System Admin','admin@email.com','admin123','admin','deactivated','2026-02-10 13:01:42','2026-04-07','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0),(3,'E002','Ms. Kim Jean S. Yap','ykean119@gmail.com','password123','instructor','active','2026-02-10 15:37:14','2026-04-12','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0),(5,'E003','Dr. Maui S. Torres','mawie@gmail.com','emp1234','instructor','deactivated','2026-02-11 05:36:44','2026-04-07','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0),(6,'E006','Dr. John Lloyd T. Danzalan','danzalan@email.com','emp12345','instructor','active','2026-02-11 12:42:52','2026-04-07','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0),(7,'E007','Mr. James T. Lagria','lagria@email.com','emp123456','instructor','active','2026-02-11 12:48:57','2026-04-07','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0),(8,'E008','Dr. Testdata T. Test','test@email.com','emp1234','instructor','active','2026-02-11 12:59:40','2026-04-07','Full-time','Entry Level Simulationist','Regular',30000.00,22,'1234',0),(9,'ADM02','Admin Kim','yapkimjean@gmail.com','admin123','admin','active','2026-05-04 14:57:24','2026-05-04','Full-time','Entry Level Simulationist','Regular',30000.00,22,'123456',1);
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
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `visitor_requests`
--

LOCK TABLES `visitor_requests` WRITE;
/*!40000 ALTER TABLE `visitor_requests` DISABLE KEYS */;
INSERT INTO `visitor_requests` VALUES (1,'Kim Jean','Yap','yapkimjean@gmail.com','2026-04-08','10:00:00','Meeting with dr.','APPROVED','We look forward to seeing you at HCT Academy!','2026-04-06 14:56:32',NULL,NULL,NULL,NULL),(2,'Tes','Data','daennylyn@gmail.com','2026-04-10','11:00:00','Meeting','APPROVED','We look forward to seeing you at HCT Academy!','2026-04-06 15:30:03',NULL,NULL,NULL,NULL),(3,'Test again','Data','daennylyn@gmail.com','2026-04-16','08:00:00','MEETING WITH NUSRSE','APPROVED',NULL,'2026-04-06 15:36:02',NULL,NULL,NULL,NULL),(4,'Test again','Data','daennylyn@gmail.com','2026-04-15','11:46:00','MEETING','REJECTED','Sorry, we have a schedule conflict.','2026-04-06 15:38:53',NULL,NULL,NULL,NULL),(5,'Test ','Data','daennylyn@gmail.com','2026-04-13','14:40:00','meeting','APPROVED',NULL,'2026-04-06 15:39:52',NULL,NULL,NULL,NULL),(6,'Test again','Data','daennylyn@gmail.com','2026-04-21','12:03:00','meeting','APPROVED','','2026-04-06 16:04:06',1,'2026-04-06 16:18:08',NULL,NULL),(7,'Kim Jean','Yap','yapkimjean@gmail.com','2026-05-12','10:00:00','Meeting ','APPROVED','','2026-04-30 16:11:15',1,'2026-04-30 16:16:56',NULL,NULL),(8,'Kim Jean','Yap','yapkimjean@gmail.com','2026-05-14','09:00:00','Meeting','REJECTED','Schedule conflict.','2026-04-30 16:14:29',1,'2026-04-30 16:18:04',NULL,NULL),(9,'Kim Jean','Yap','yapkimjean@gmail.com','2026-05-15','16:00:00','Meeting','APPROVED',NULL,'2026-04-30 16:21:00',1,'2026-04-30 16:41:28',NULL,NULL),(10,'Kim Jean','Yap','yapkimjean@gmail.com','2026-05-15','05:41:00','meeting','REJECTED','Because of schedule','2026-04-30 16:41:46',1,'2026-04-30 16:42:45',NULL,NULL),(11,'Kim Jean','Yap','yapkimjean@gmail.com','2026-05-15','05:41:00','meeting','APPROVED',NULL,'2026-04-30 16:41:50',1,'2026-04-30 16:43:09',NULL,NULL),(12,'Kim','Jean','yapkimjean@gmail.com','2026-05-09','11:00:00','Meeting','APPROVED',NULL,'2026-04-30 18:02:56',1,'2026-04-30 18:05:32','09469738712',NULL),(13,'Kim','Jean','yapkimjean@gmail.com','2026-05-12','09:00:00','Meeting','APPROVED',NULL,'2026-05-01 09:43:31',1,'2026-05-01 09:43:56','09469738712',NULL),(14,'Kim','Jean','yapkimjean@gmail.com','2026-05-07','10:53:00','meeting','APPROVED',NULL,'2026-05-04 23:54:01',9,'2026-05-05 00:00:56','09469738712',NULL);
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

-- Dump completed on 2026-05-06  2:23:03

CREATE DATABASE EducationSystem;
GO
USE EducationSystem;
GO

CREATE TABLE Roles (
    Id INT PRIMARY KEY IDENTITY(1,1),
    RoleName NVARCHAR(50) NOT NULL UNIQUE
);
INSERT INTO Roles (RoleName) VALUES ('Student'), ('Teacher'), ('Admin');

CREATE TABLE Categories (
    Id INT PRIMARY KEY IDENTITY(1,1),
    CategoryName NVARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE Users (
    Id INT PRIMARY KEY IDENTITY(1,1),
    Username NVARCHAR(100) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(255) NOT NULL,
    RoleId INT NOT NULL FOREIGN KEY REFERENCES Roles(Id),
    FirstName NVARCHAR(100),
    LastName NVARCHAR(100),
    MiddleName NVARCHAR(100),
    IsBlocked BIT DEFAULT 0,
    CreatedAt DATETIME DEFAULT GETUTCDATE()
);

CREATE TABLE EducationalMaterials (
    Id INT PRIMARY KEY IDENTITY(1,1),
    TeacherId INT NOT NULL FOREIGN KEY REFERENCES Users(Id),
    Title NVARCHAR(255) NOT NULL,
    CategoryId INT NOT NULL FOREIGN KEY REFERENCES Categories(Id),
    OriginalFileName NVARCHAR(255),
    Summary NVARCHAR(MAX),
    Terms NVARCHAR(MAX),
    Quizzes NVARCHAR(MAX),
    SelfCheck NVARCHAR(MAX),
    PracticalTask NVARCHAR(MAX),
    IsPublished BIT DEFAULT 0,
    IsPublic BIT DEFAULT 0,
    CreatedAt DATETIME DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME DEFAULT GETUTCDATE()
);

CREATE TABLE StudentMaterialProgress (
    Id INT PRIMARY KEY IDENTITY(1,1),
    StudentId INT NOT NULL FOREIGN KEY REFERENCES Users(Id),
    MaterialId INT NOT NULL FOREIGN KEY REFERENCES EducationalMaterials(Id),
    SummaryRead BIT NOT NULL DEFAULT 0,
    TermsLearned BIT NOT NULL DEFAULT 0,
    QuizCompleted BIT NOT NULL DEFAULT 0,
    LastQuizScore INT NULL,
    QuizAttempts INT NOT NULL DEFAULT 0,
    TotalQuizPercent INT NOT NULL DEFAULT 0,
    LastOpenedAt DATETIME NULL,
    UpdatedAt DATETIME NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_StudentMaterialProgress UNIQUE (StudentId, MaterialId)
);

CREATE TABLE SystemConfigs (
    ConfigKey NVARCHAR(50) PRIMARY KEY,
    ConfigValue NVARCHAR(MAX)
);

GO

UPDATE Users 
SET RoleId = 3 
WHERE Username = 'administrator@gmail.com';
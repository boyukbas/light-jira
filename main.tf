# AWS Provider
provider "aws" {
  region = "eu-central-1" # Can be changed to preferred region
}

# Zip the handler
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_file = "lambda_handler.js"
  output_path = "lambda_function.zip"
}

# IAM Role for Lambda
resource "aws_iam_role" "iam_for_lambda" {
  name = "jira_proxy_lambda_role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Sid    = ""
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      },
    ]
  })
}

# Lambda Function
resource "aws_lambda_function" "jira_proxy" {
  filename      = "lambda_function.zip"
  function_name = "jira_proxy"
  role          = aws_iam_role.iam_for_lambda.arn
  handler       = "lambda_handler.handler"

  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  runtime = "nodejs18.x"
  timeout = 30

  environment {
    variables = {
      JIRA_BASE = "https://site.atlassian.net"
    }
  }
}

# Function URL (Simpler than API Gateway)
resource "aws_lambda_function_url" "jira_proxy_url" {
  function_name      = aws_lambda_function.jira_proxy.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = true
    allow_origins     = ["https://boyukbas.github.io", "http://localhost:3000"]
    allow_methods     = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers     = ["*"]
    expose_headers     = ["*"]
    max_age           = 3600
  }
}

# Output the URL
output "function_url" {
  value = aws_lambda_function_url.jira_proxy_url.function_url
}

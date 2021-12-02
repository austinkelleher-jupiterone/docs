#!groovy

pipeline {
 agent none

  options {
    ansiColor('xterm')
    timestamps()
  }

  stages {
    stage('Build and scan') {
      agent { label 'ecs-builder-node12' }
      steps {
        initBuild()
        securityScan()
        sh 'yarn install --frozen-lockfile'

        sh 'yarn lint'

        sh 'yarn test:unit'

        sh 'yarn bundle'

        sh 'jupiterone-build'

      }
    }

    stage("Deploy") {
      when { branch "main" }
      steps {
         initBuild()
            sh 'yarn install --frozen-lockfile'

            sh 'yarn lint'

            sh 'yarn test:unit'

            sh 'yarn bundle'

            sh 'jupiterone-build'
                    withCredentials([
          string(credentialsId: 'vanilla_staging_auth_token', variable: 'TOKEN')
        ]) {
          sh '''
            TOKEN="$TOKEN" yarn start
          '''

        }
            
      }
    }
  }
}
